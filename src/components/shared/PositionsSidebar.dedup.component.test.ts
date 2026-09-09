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
 * BUG-0423 — duplicate account fetches from two mounted sidebars.
 *
 * The sidebar mounts twice (desktop + mobile, CSS-hidden still mounted),
 * and each instance runs its mount fetch and its keys-change effect
 * independently. BUG-0412 already orders the responses so a stale one
 * cannot corrupt the store; what remains is pure traffic: one POST per
 * instance per trigger instead of one POST per trigger.
 *
 * These tests pin the deduplication half and must fail until reads are
 * single-flighted (shared inflight promise per trigger) and the hidden
 * instance stops fetching of its own. They deliberately do not stage the
 * BUG-0412 race — that shape lives in
 * PositionsSidebar.race.component.test.ts and stays untouched.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { accountState } from "../../stores/account.svelte";
import { resetAccountFetchSingleflightForTest } from "../../services/accountFetchSingleflight";
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

let pendingAccounts: { resolve: (body: unknown) => void }[] = [];
let host: HTMLElement;
let mounted: unknown[] = [];

const accountBody = (positionMode: string) => ({
    success: true,
    data: { positionMode, available: "0", margin: "0", frozen: "0" },
});

function accountPostCount(): number {
    return appFetchMock.mock.calls.filter(([url]) => String(url) === "/api/account").length;
}

function routeFetchDeferred() {
    pendingAccounts = [];
    appFetchMock.mockImplementation(async (url: string) => {
        if (String(url) === "/api/account") {
            const json = await new Promise<unknown>((resolve) => {
                pendingAccounts.push({ resolve });
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

async function resolveAllPending() {
    const all = pendingAccounts;
    pendingAccounts = [];
    for (const p of all) p.resolve(accountBody("ONE_WAY"));
    await settle();
}

async function mountSidebar(props: { fetchEnabled?: boolean } = {}) {
    const component = mount(PositionsSidebar, { target: host, props });
    mounted.push(component);
    await settle();
}

beforeEach(() => {
    vi.clearAllMocks();
    resetAccountFetchSingleflightForTest();
    accountState.reset();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    for (const component of mounted) unmount(component as never);
    mounted = [];
    host.remove();
});

describe("BUG-0423 — duplicate account fetches", () => {
    it("two mounted instances issue one account POST per trigger, not one per instance", async () => {
        routeFetchDeferred();
        await mountSidebar();
        await mountSidebar();

        // Mount trigger coalesced to one POST, keys-change trigger coalesced
        // to one POST: two for two instances. Without the fix this is four.
        expect(accountPostCount()).toBe(2);

        await resolveAllPending();
        expect(accountState.positionMode).toBe("ONE_WAY");
    });

    it("a hidden instance issues no fetch of its own", async () => {
        routeFetchDeferred();
        await mountSidebar({ fetchEnabled: false });

        // Without the fix the prop does not exist and the instance fetches
        // on mount and on keys change like a visible one.
        expect(accountPostCount()).toBe(0);
    });
});
