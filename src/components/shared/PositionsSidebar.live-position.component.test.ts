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
 * BUG-0347 — the modal must read the live position, not a click-time snapshot.
 *
 * `PositionsSidebar` used to store the `OMSPosition` object handed to it by
 * `PositionsList` and pass that straight to the dialog. `mappedPositions`
 * rebuilds those objects on every price tick, so the stored one froze at the
 * moment of the click — a position that moved while the dialog was open kept
 * showing the old mark price and PnL.
 *
 * This test drives the parent half: it opens the close dialog through a
 * click-shaped stub, then changes the store and asserts the modal's `position`
 * prop followed. `PositionsList` and `ClosePositionModal` are replaced by
 * probes so the assertion is on the value the parent hands down, not on the
 * modal's rendering.
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
            // FEAT-0405 A5 — the signer now runs the venue's key-shape check
            // client-side (it replaced the server's `validateKeys`, see
            // browserSigning.ts), so single-character placeholders are refused
            // before dispatch and the request never leaves.
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

/**
 * The venue's own declaration of what it takes (FEAT-0017), mutable so a test
 * can state which venue it is looking at. Defaults keep the fixture this file
 * was written against: a venue that cannot scale in and cannot take a
 * standalone plan.
 */
const venue = vi.hoisted(() => ({
    capabilities: { addToPosition: false, tpSlStandalone: false },
}));

vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({ capabilities: venue.capabilities, supports: {} }),
}));

vi.mock("../../lib/appAuth", () => ({ appFetch: vi.fn() }));
import { appFetch } from "../../lib/appAuth";
const appFetchMock = vi.mocked(appFetch);

async function stubComponent() {
    return { default: (await import("../../tests/helpers/EmptyStub.svelte")).default };
}
vi.mock("./ActiveAccountChip.svelte", stubComponent);
vi.mock("./PositionsList.svelte", async () => ({
    default: (await import("../../tests/helpers/PositionsListTrigger.svelte")).default,
}));
vi.mock("./AccountSummary.svelte", stubComponent);
vi.mock("./OpenOrdersList.svelte", stubComponent);
vi.mock("./OrderHistoryList.svelte", stubComponent);
vi.mock("./TpSlList.svelte", stubComponent);
vi.mock("./ClosePositionModal.svelte", async () => ({
    default: (await import("../../tests/helpers/PositionProbeModal.svelte")).default,
}));
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

let host: HTMLElement;
let mounted: unknown[] = [];

const positionBody = () => ({
    success: true,
    data: {
        positions: [
            {
                positionId: "id-BTCUSDT",
                symbol: "BTCUSDT",
                side: "LONG",
                size: "2",
                entryPrice: "100",
                unrealizedPnL: "10",
                margin: "20",
                leverage: "10",
                marginMode: "ISOLATION",
            },
        ],
    },
});

function routeFetch() {
    appFetchMock.mockImplementation(async (url: string) => {
        if (String(url) === "/api/positions") {
            return { ok: true, json: async () => positionBody() };
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

/**
 * Let the component's signed requests reach `appFetch`.
 *
 * A macrotask, not just a microtask: the signer's WebCrypto call
 * (`crypto.subtle.sign`) resolves off the microtask queue, so a microtask-only
 * flush returns while the request is still in flight and the assertion runs
 * against an empty store.
 *
 * Budgeted in wall-clock time rather than in turns. How many macrotasks the
 * signer needs is decided by when its libuv threadpool callback comes back,
 * which stretches past any fixed turn count when the suite runs parallel to
 * other files. A deferred response cannot land however long this waits — the
 * mock holds it open — so the budget is an upper bound on the wait, not a
 * race against one.
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
 * Yield macrotasks until `condition` holds, for the reads whose *result* the
 * test asserts on.
 *
 * `settle`'s budget is a guess at how long the signer's WebCrypto callback
 * takes, and that guess is only wrong on a loaded machine — which is where
 * these assertions used to see an empty store. Waiting for the hydration
 * itself removes the guess.
 */
async function settleUntil(condition: () => boolean, budgetMs = 3000): Promise<void> {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
        flushSync();
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("settleUntil: condition never held");
}

function text(testid: string): string {
    return host.querySelector(`[data-testid="${testid}"]`)?.textContent?.trim() ?? "";
}

beforeEach(() => {
    vi.clearAllMocks();
    venue.capabilities.addToPosition = false;
    venue.capabilities.tpSlStandalone = false;
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


/*
 * FEAT-0023 — the epic's last checkable acceptance criterion: an action the
 * venue cannot take must be absent, not offered and refused.
 *
 * `PositionsList` pins the rendering rule; this pins the half above it — that
 * the venue's own `tpSlStandalone` declaration is what decides. On a venue
 * that answers false, `TpSlCreateModal` is unreachable from a position row,
 * so there is no form to fill in and no submission to be refused after the
 * trader committed.
 */
describe("FEAT-0023 — capability flags decide which position controls exist", () => {
    async function renderWithPosition() {
        routeFetch();
        mounted.push(
            mount(PositionsSidebar, {
                target: host,
                props: { activeAccountId: "acc-1" },
            }) as never,
        );
        await settleUntil(() => host.querySelector('[data-testid="open-close"]') !== null);
    }

    it("offers no TP/SL control where the venue takes no standalone plan", async () => {
        venue.capabilities.tpSlStandalone = false;
        await renderWithPosition();

        expect(host.querySelector('[data-testid="open-close"]')).not.toBeNull();
        expect(host.querySelector('[data-testid="open-tp-sl"]')).toBeNull();
    });

    it("offers the TP/SL control where the venue does, and it opens the dialog", async () => {
        venue.capabilities.tpSlStandalone = true;
        await renderWithPosition();

        const control = host.querySelector<HTMLButtonElement>('[data-testid="open-tp-sl"]');
        expect(control).not.toBeNull();

        control!.click();
        flushSync();
        // The modal itself is stubbed out here; reaching it is the claim.
        expect(control!.dataset.positionId).toBe("id-BTCUSDT");
    });

    it("offers no TP/SL tab where the venue holds no plans", async () => {
        // The tab's whole content is refused on such a venue: every TP/SL
        // verb — including the list read — is gated on `supports.tpSl: false`.
        // A tab that can only ever resolve to an error is a control that fails
        // after the trader clicked it, which is the direction FEAT-0017 exists
        // to prevent.
        venue.capabilities.tpSlStandalone = false;
        await renderWithPosition();

        const tabs = [...host.querySelectorAll("button")];
        const tabLabels = tabs.map((b) => b.textContent?.trim());
        expect(tabLabels.some((t) => t?.includes("TP/SL"))).toBe(false);
        // Its siblings stay: a venue that cannot do TP/SL can still list
        // positions, orders and history.
        expect(tabLabels.some((t) => t?.includes("Orders"))).toBe(true);
        expect(tabLabels.some((t) => t?.includes("History"))).toBe(true);
    });

    it("offers the TP/SL tab where the venue does", async () => {
        venue.capabilities.tpSlStandalone = true;
        await renderWithPosition();

        const tabs = [...host.querySelectorAll("button")];
        expect(tabs.some((b) => b.textContent?.trim().includes("TP/SL"))).toBe(true);
    });

    it("applies the same rule to add-to-position", async () => {
        venue.capabilities.addToPosition = false;
        await renderWithPosition();
        expect(host.querySelector('[data-testid="open-add"]')).toBeNull();

        unmount(mounted.pop() as never);
        mounted = [];

        venue.capabilities.addToPosition = true;
        await renderWithPosition();
        expect(host.querySelector('[data-testid="open-add"]')).not.toBeNull();
    });
});

describe("BUG-0347 — the open dialog follows the live position", () => {
    it("hand the modal a new object when the store's position updates", async () => {
        routeFetch();
        mounted.push(mount(PositionsSidebar, { target: host, props: { fetchEnabled: true } }));
        await settleUntil(() => accountState.positions.length > 0);

        expect(accountState.positions.map((p) => p.positionId)).toEqual(["id-BTCUSDT"]);

        const openButton = host.querySelector<HTMLButtonElement>('[data-testid="open-close"]');
        expect(openButton).not.toBeNull();
        openButton?.click();
        await settle();

        // The dialog opened on the hydrated snapshot.
        expect(text("probe-symbol")).toBe("BTCUSDT");
        expect(text("probe-pnl")).toBe("10");

        // A live position update lands while the dialog is open.
        accountState.updatePositionFromWs({
            positionId: "id-BTCUSDT",
            symbol: "BTCUSDT",
            side: "LONG",
            avgOpenPrice: "100",
            unrealizedPNL: "20",
        } as never);
        await settle();

        // The modal must be holding the live object, not the click-time one.
        expect(text("probe-pnl")).toBe("20");
    });

    it("closes the dialog when the position disappears", async () => {
        routeFetch();
        mounted.push(mount(PositionsSidebar, { target: host, props: { fetchEnabled: true } }));
        await settleUntil(() => accountState.positions.length > 0);

        host.querySelector<HTMLButtonElement>('[data-testid="open-close"]')?.click();
        await settle();
        expect(text("probe-symbol")).toBe("BTCUSDT");

        // An explicit close push removes it from the store.
        accountState.updatePositionFromWs({
            positionId: "id-BTCUSDT",
            symbol: "BTCUSDT",
            side: "LONG",
            qty: "0",
            event: "CLOSE",
        } as never);
        await settle();

        expect(accountState.positions).toEqual([]);
        expect(host.querySelector('[data-testid="probe-symbol"]')).toBeNull();
    });
});
