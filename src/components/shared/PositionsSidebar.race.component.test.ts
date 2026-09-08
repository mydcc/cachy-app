// @vitest-environment happy-dom
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

/*
 * BUG-0412 — overlapping account reads race with last-wins and no ordering.
 *
 * The sidebar mounts twice (desktop + mobile, CSS-hidden still mounted),
 * each instance fetches on mount and on keys change into the same store,
 * and nothing sequences the responses: whichever lands last wins, even a
 * stale pre-write response landing after a fresh post-write one. Observed
 * live: a fresh ONE_WAY `/api/account` body in Network next to a Hedge
 * chip, five identical account POSTs within 1.25 s of reload.
 *
 * The control test proves the harness (deferred plumbing assigns values);
 * the race test pins the defect and must fail until reads are sequenced
 * or single-flighted.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { accountState } from "../../stores/account.svelte";
import en from "../../locales/locales/en.json";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({
    apiProvider: "bitunix" as string,
    activeAccountId: "acc-1",
    accounts: [
        {
            id: "acc-1",
            name: "test",
            exchange: "bitunix",
            keys: { key: "k", secret: "s" },
        },
    ],
    hideUnfilledOrders: false,
    positionViewMode: "detailed",
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

vi.mock("../../stores/paperTrading.svelte", () => ({
    paperState: { enabled: false, fills: [] as unknown[] },
}));

vi.mock("../../services/paperAccountFeed", () => ({ paperAccountFeed: () => null }));

vi.mock("../../stores/market.svelte", () => ({ marketState: { data: {} } }));

vi.mock("../../stores/trade.svelte", () => ({ tradeState: {} }));

vi.mock("../../services/marketWatcher", () => ({
    marketWatcher: { register: vi.fn(), unregister: vi.fn() },
}));

vi.mock("../../stores/tpsl.svelte", () => ({
    tpSlState: { ensureFresh: vi.fn(), invalidate: vi.fn() },
}));

vi.mock("../../services/exchange", () => ({ activeExchange: () => ({ capabilities: {}, supports: {} }) }));

vi.mock("../../lib/appAuth", () => ({ appFetch: vi.fn() }));
import { appFetch } from "../../lib/appAuth";
const appFetchMock = vi.mocked(appFetch);

async function stubComponent() {
    return { default: (await import("../../tests/helpers/EmptyStub.svelte")).default };
}
vi.mock("./ActiveAccountChip.svelte", stubComponent);
vi.mock("./PositionsList.svelte", stubComponent);
vi.mock("./AccountSummary.svelte", stubComponent);
vi.mock("./OpenOrdersList.svelte", stubComponent);
vi.mock("./OrderHistoryList.svelte", stubComponent);
vi.mock("./TpSlList.svelte", stubComponent);
vi.mock("./ClosePositionModal.svelte", stubComponent);
vi.mock("./ConfirmActionModal.svelte", stubComponent);
vi.mock("./AdjustMarginModal.svelte", stubComponent);
vi.mock("./AddToPositionModal.svelte", stubComponent);
vi.mock("./TpSlCreateModal.svelte", stubComponent);

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string) => lookup(key) ?? key),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

import PositionsSidebar from "./PositionsSidebar.svelte";

type PendingAccount = { mode: string; resolve: (body: unknown) => void };
let pendingAccounts: PendingAccount[] = [];
let host: HTMLElement;
let mounted: unknown[] = [];

const accountBody = (positionMode: string) => ({
    success: true,
    data: { positionMode, available: "0", margin: "0", frozen: "0" },
});

function routeFetch(firstMode: string, restMode: string) {
    let calls = 0;
    pendingAccounts = [];
    appFetchMock.mockImplementation(async (url: string) => {
        if (String(url) === "/api/account") {
            const n = calls++;
            const mode = n === 0 ? firstMode : restMode;
            const json = await new Promise<unknown>((resolve) => {
                pendingAccounts.push({ mode, resolve });
            });
            return { ok: true, json: async () => json };
        }
        if (String(url) === "/api/positions") {
            return { ok: true, json: async () => ({ success: true, data: { positions: [] } }) };
        }
        return { ok: true, json: async () => ({ orders: [] }) };
    });
}

async function settle(rounds = 8) {
    for (let i = 0; i < rounds; i++) {
        flushSync();
        await Promise.resolve();
    }
    flushSync();
}

async function resolvePending(mode: string | null) {
    const matching = pendingAccounts.filter((p) => mode === null || p.mode === mode);
    pendingAccounts = pendingAccounts.filter((p) => mode !== null && p.mode !== mode);
    for (const p of matching) p.resolve(accountBody(p.mode));
    await settle();
}

async function mountSidebar() {
    const component = mount(PositionsSidebar, { target: host, props: {} });
    mounted.push(component);
    await settle();
}

beforeEach(() => {
    vi.clearAllMocks();
    accountState.reset();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    for (const component of mounted) unmount(component as never);
    mounted = [];
    host.remove();
});

describe("BUG-0412 — overlapping account reads", () => {
    it("control: a fresh response landing last wins", async () => {
        routeFetch("HEDGE", "ONE_WAY");
        await mountSidebar();

        // Stale first, fresh after: final state follows the last landing.
        await resolvePending("HEDGE");
        expect(accountState.positionMode).toBe("HEDGE");
        await resolvePending("ONE_WAY");
        expect(accountState.positionMode).toBe("ONE_WAY");
    });

    it("a stale response landing last must not overwrite a fresher one", async () => {
        routeFetch("HEDGE", "ONE_WAY");
        await mountSidebar();
        await mountSidebar();

        // Fresh responses land first...
        await resolvePending("ONE_WAY");
        expect(accountState.positionMode).toBe("ONE_WAY");
        // ...then the stale first read lands last. It must lose.
        await resolvePending("HEDGE");
        expect(accountState.positionMode).toBe("ONE_WAY");
    });
});

/*
 * BUG-0421 — the same race, one panel over.
 *
 * `fetchPositions` guards itself with a `loadingPositions` flag, but that
 * flag is per component instance and the panel mounts twice. Two instances
 * hold two flags, neither sees the other's request, and the last response to
 * land wins — so a stale read can resurrect a position the trader has closed.
 */

type PendingPositions = { symbols: string[]; resolve: (body: unknown) => void };
let pendingPositions: PendingPositions[] = [];

const positionsBody = (symbols: string[]) => ({
    success: true,
    data: {
        positions: symbols.map((symbol) => ({
            symbol,
            positionId: `id-${symbol}`,
            side: "LONG",
            qty: "1",
            entryValue: "100",
            avgOpenPrice: "100",
            unrealizedPNL: "0",
            margin: "10",
            leverage: "10",
            marginMode: "ISOLATION",
        })),
    },
});

function routePositions(first: string[], rest: string[]) {
    let calls = 0;
    pendingPositions = [];
    appFetchMock.mockImplementation(async (url: string) => {
        if (String(url) === "/api/positions") {
            const n = calls++;
            const symbols = n === 0 ? first : rest;
            const json = await new Promise<unknown>((resolve) => {
                pendingPositions.push({ symbols, resolve });
            });
            return { ok: true, json: async () => json };
        }
        if (String(url) === "/api/account") {
            return {
                ok: true,
                json: async () => ({
                    success: true,
                    data: { positionMode: "ONE_WAY", available: "0", margin: "0", frozen: "0" },
                }),
            };
        }
        return { ok: true, json: async () => ({ orders: [] }) };
    });
}

async function resolvePositions(match: (p: PendingPositions) => boolean) {
    const matching = pendingPositions.filter(match);
    pendingPositions = pendingPositions.filter((p) => !match(p));
    for (const p of matching) p.resolve(positionsBody(p.symbols));
    await settle();
}

describe("BUG-0421 — overlapping position reads", () => {
    it("a stale response must not resurrect a position that was closed", async () => {
        // First read still sees the open position; every later read sees it gone.
        routePositions(["BTCUSDT"], []);
        await mountSidebar();
        await mountSidebar();

        // The fresh read lands first: the position is closed.
        await resolvePositions((p) => p.symbols.length === 0);
        expect(accountState.positions.map((p) => p.symbol)).toEqual([]);

        // The stale read lands last. A closed position must stay closed.
        await resolvePositions((p) => p.symbols.length > 0);
        expect(accountState.positions.map((p) => p.symbol)).toEqual([]);
    });
});
