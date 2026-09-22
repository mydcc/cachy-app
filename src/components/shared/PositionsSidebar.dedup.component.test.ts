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
            // FEAT-0405 A5 — same reason as the sibling component tests: the
            // signer runs the venue key-shape check client-side now, so
            // one-character placeholders are refused before dispatch.
            keys: { key: "test-key-0123456789", secret: "test-secret-0123456789" },
        },
    ],
    hideUnfilledOrders: false,
    // BUG-0512: shipped default — stale display on, so seeded positions
    // keep resolving exactly like production.
    showStalePriceBadge: true,
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
import { webcrypto } from "node:crypto";

// happy-dom ships no `crypto.subtle`, and `signCachyRequest` refuses to run
// without it (browserSigning.ts — INSECURE_CONTEXT, ADR-0013 failure mode 3),
// so every signed request would be swallowed by the component's catch. Node's
// WebCrypto is the same API the browser exposes, so the component signs a real
// envelope here exactly as it does in production.
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

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

/**
 * Let the component's signed requests reach `appFetch`.
 *
 * A macrotask, not just a microtask: the signer's WebCrypto call
 * (`crypto.subtle.sign`) resolves off the microtask queue, so a microtask-only
 * flush returns while the requests are still in flight and the POST count is
 * read as zero.
 *
 * Budgeted in wall-clock time rather than in turns. How many macrotasks the
 * signer needs is decided by when its libuv threadpool callback comes back,
 * which stretches past any fixed turn count when the suite runs parallel to
 * other files. No response can land however long this waits, so the budget is
 * an upper bound on the wait, not a race against one.
 */
async function settle(budgetMs = 200) {
    const deadline = Date.now() + budgetMs;
    do {
        flushSync();
        await new Promise((resolve) => setTimeout(resolve, 0));
    } while (Date.now() < deadline);
    flushSync();
}

/**
 * Yield macrotasks until `read` stops changing.
 *
 * The number of requests dispatched is what these tests assert on, and signing
 * decides only *when* each one reaches `appFetch` — so the count is what to
 * wait for, and a fixed budget long enough on an idle machine is still short
 * on a loaded one. Waiting for the count to settle is not the same as waiting
 * for a threshold: a broken coalescer reaches four and stays there, and the
 * assertion still sees four.
 */
async function settleStable(read: () => number, budgetMs = 3000): Promise<void> {
    const deadline = Date.now() + budgetMs;
    let last = -1;
    let unchanged = 0;
    while (Date.now() < deadline) {
        flushSync();
        const now = read();
        unchanged = now === last ? unchanged + 1 : 0;
        last = now;
        if (unchanged >= 5) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("settleStable: request count never settled");
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
        await settleStable(accountPostCount);

        // Mount trigger coalesced to one POST, keys-change trigger coalesced
        // to one POST: two for two instances. Without the fix this is four.
        expect(accountPostCount()).toBe(2);

        await resolveAllPending();
        expect(accountState.positionMode).toBe("ONE_WAY");
    });

    it("a hidden instance issues no fetch of its own", async () => {
        routeFetchDeferred();
        await mountSidebar({ fetchEnabled: false });
        await settleStable(accountPostCount);

        // Without the fix the prop does not exist and the instance fetches
        // on mount and on keys change like a visible one.
        expect(accountPostCount()).toBe(0);
    });
});
