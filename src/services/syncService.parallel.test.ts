/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * FEAT-0370 — the three Bitunix sync endpoints (history, pending, orders)
 * are independent, so they must be dispatched concurrently and a transient
 * failure of a non-critical endpoint must not discard valid history trades.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const appFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/appAuth", () => ({ appFetch: appFetchMock }));

vi.mock("../stores/settings/accounts", () => ({
    keysForActiveAccount: () => ({ key: "test-key", secret: "test-secret" }),
}));
vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        entitlement: { isPro: true },
        accounts: [],
        activeAccountId: "acct-active",
        apiProvider: "bitunix",
    },
}));

const journalSetMock = vi.hoisted(() => vi.fn());
const journalFlushMock = vi.hoisted(() => vi.fn(async () => {}));
const journalEntriesMock = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock("../stores/journal.svelte", () => ({
    journalState: {
        get entries() {
            return journalEntriesMock.current;
        },
        set: journalSetMock,
        flush: journalFlushMock,
    },
}));

const uiMocks = vi.hoisted(() => ({
    update: vi.fn(),
    setSyncProgress: vi.fn(),
    showError: vi.fn(),
    showFeedback: vi.fn(),
}));
vi.mock("../stores/ui.svelte", () => ({ uiState: uiMocks }));

vi.mock("./accountSession.svelte", () => ({
    accountSession: {
        current: () => ({}),
        isCurrent: () => true,
    },
}));

vi.mock("./apiService", () => ({
    apiService: { fetchBitunixKlines: vi.fn(async () => []) },
}));

vi.mock("../locales/i18n", () => ({
    _: {
        subscribe: (run: (value: (key: string) => string) => void) => {
            run((key: string) => key);
            return () => {};
        },
    },
}));

vi.mock("./trackingService", () => ({ trackCustomEvent: vi.fn() }));
vi.mock("../lib/calculator", () => ({
    calculator: { calculateATR: () => undefined },
}));
vi.mock("./feeRateService", () => ({
    refreshDerivedFeeRates: vi.fn(async () => null),
}));

import { syncService } from "./syncService";

function okResponse(body: unknown) {
    return { ok: true, json: async () => body };
}

function historyPosition() {
    const now = Date.now();
    return {
        positionId: "POS-1",
        symbol: "BTCUSDT",
        side: "Buy",
        ctime: now - 3_600_000,
        mtime: now,
        entryPrice: "50000",
        closePrice: "51000",
        leverage: "10",
        realizedPNL: "100",
        funding: "0",
        fee: "1",
        maxQty: "0.1",
    };
}

function lastJournalWrite(): unknown[] {
    const calls = journalSetMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][0] as unknown[];
}

beforeEach(() => {
    vi.clearAllMocks();
    journalEntriesMock.current = [];
    syncService._syncLock = false;
});

describe("syncBitunixPositions — concurrent dispatch", () => {
    it("dispatches history, pending and orders requests before any of them resolves", async () => {
        const resolvers = new Map<string, (value: unknown) => void>();
        appFetchMock.mockImplementation(
            (url: string) =>
                new Promise((resolve) => {
                    resolvers.set(url, resolve);
                }),
        );

        const done = syncService.syncBitunixPositions();

        // Sequential code would stop after the first dispatch and wait for
        // its response; concurrent code has all three in flight already.
        expect([...resolvers.keys()].sort()).toEqual([
            "/api/sync/orders",
            "/api/sync/positions-history",
            "/api/sync/positions-pending",
        ]);

        for (const resolve of resolvers.values()) resolve(okResponse({ data: [] }));
        await done;
        expect(syncService._syncLock).toBe(false);
    });
});

describe("syncBitunixPositions — partial failure tolerance", () => {
    it("still imports history trades when the pending endpoint fails", async () => {
        appFetchMock.mockImplementation(async (url: string) => {
            if (url === "/api/sync/positions-pending") return { ok: false };
            if (url === "/api/sync/orders") return okResponse({ data: [] });
            return okResponse({ data: [historyPosition()] });
        });

        await syncService.syncBitunixPositions();

        const written = lastJournalWrite();
        expect(written.some((e) => (e as { tradeId: string }).tradeId === "POS-1")).toBe(true);
        // The sync is honestly reported as incomplete instead of a full success.
        expect(uiMocks.showError).toHaveBeenCalledWith("apiErrors.syncIncomplete");
    });

    it("still imports history trades when the orders endpoint fails", async () => {
        appFetchMock.mockImplementation(async (url: string) => {
            if (url === "/api/sync/orders") return { ok: false };
            if (url === "/api/sync/positions-pending") return okResponse({ data: [] });
            return okResponse({ data: [historyPosition()] });
        });

        await syncService.syncBitunixPositions();

        const written = lastJournalWrite();
        expect(written.some((e) => (e as { tradeId: string }).tradeId === "POS-1")).toBe(true);
        expect(uiMocks.showError).toHaveBeenCalledWith("apiErrors.syncIncomplete");
    });

    it("aborts without touching the journal when the history endpoint fails", async () => {
        appFetchMock.mockImplementation(async (url: string) => {
            if (url === "/api/sync/positions-history") return { ok: false };
            return okResponse({ data: [] });
        });

        await syncService.syncBitunixPositions();

        expect(journalSetMock).not.toHaveBeenCalled();
        expect(syncService._syncLock).toBe(false);
    });
});
