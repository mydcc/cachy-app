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
 * FEAT-0023, follow-up — an epoch change must clear every open position
 * dialog id, not just hide the dialog.
 *
 * Each dialog resolves its stored id against the live position list, so a
 * venue switch already unmounts the modal by emptying the list. What the
 * epoch effect guards is the id: without the clearing, switching back to
 * the same account re-opens the dialog on the same position — a stale
 * dialog, not a submittable form. All five ids are cleared in one block
 * (`PositionsSidebar.svelte`, the `accountEpoch.seq` effect); this pins
 * that block by opening every dialog, rotating the epoch the way a
 * provider change does, and asserting none survives.
 *
 * The modals are stubbed to probes, so the count is the claim: five open
 * dialogs render five `probe-symbol` spans (the flash confirm has no
 * position and renders "none"), and a cleared id unmounts its modal.
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
            keys: { key: "test-key-0123456789", secret: "test-secret-0123456789" },
        },
    ],
    hideUnfilledOrders: false,
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

const { venueCapabilities, resetVenueCapabilities } = await import(
    "../../tests/helpers/venueCapabilities.svelte"
);

vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({ capabilities: venueCapabilities, supports: {} }),
}));

vi.mock("../../lib/appAuth", () => ({ appFetch: vi.fn() }));
import { appFetch } from "../../lib/appAuth";
const appFetchMock = vi.mocked(appFetch);

async function stubComponent() {
    return { default: (await import("../../tests/helpers/EmptyStub.svelte")).default };
}
async function probeModal() {
    return { default: (await import("../../tests/helpers/PositionProbeModal.svelte")).default };
}
vi.mock("./ActiveAccountChip.svelte", stubComponent);
vi.mock("./PositionsList.svelte", async () => ({
    default: (await import("../../tests/helpers/PositionsListTrigger.svelte")).default,
}));
vi.mock("./AccountSummary.svelte", stubComponent);
vi.mock("./OpenOrdersList.svelte", stubComponent);
vi.mock("./OrderHistoryList.svelte", stubComponent);
vi.mock("./TpSlList.svelte", stubComponent);
vi.mock("./ClosePositionModal.svelte", probeModal);
vi.mock("./ConfirmActionModal.svelte", probeModal);
vi.mock("./AdjustMarginModal.svelte", probeModal);
vi.mock("./AddToPositionModal.svelte", probeModal);
vi.mock("./TpSlCreateModal.svelte", probeModal);

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
import { accountEpoch } from "../../services/accountEpoch.svelte";
import { webcrypto } from "node:crypto";

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

async function settle(budgetMs = 200) {
    const deadline = Date.now() + budgetMs;
    do {
        flushSync();
        await new Promise((resolve) => setTimeout(resolve, 0));
    } while (Date.now() < deadline);
    flushSync();
}

async function settleUntil(condition: () => boolean, budgetMs = 3000): Promise<void> {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
        flushSync();
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("settleUntil: condition never held");
}

function probeCount(): number {
    return host.querySelectorAll('[data-testid="probe-symbol"]').length;
}

const DIALOG_TRIGGERS = [
    "open-close",
    "open-tp-sl",
    "open-add",
    "open-adjust",
    "open-flash",
] as const;

beforeEach(() => {
    vi.clearAllMocks();
    resetVenueCapabilities();
    resetAccountFetchSingleflightForTest();
    accountState.reset();
    venueCapabilities.tpSlStandalone = true;
    venueCapabilities.addToPosition = true;
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    for (const component of mounted) unmount(component as never);
    mounted = [];
    host.remove();
});

async function mountWithAllDialogsOpen(): Promise<void> {
    routeFetch();
    mounted.push(
        mount(PositionsSidebar, {
            target: host,
            props: { activeAccountId: "acc-1" },
        }) as never,
    );
    await settleUntil(() => host.querySelector('[data-testid="open-close"]') !== null);
    // Every trigger must exist: a missing button would click nothing and the
    // count below would assert about a dialog that was never opened.
    for (const testid of DIALOG_TRIGGERS) {
        const button = host.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`);
        if (!button) throw new Error(`dialog trigger missing: ${testid}`);
        button.click();
        flushSync();
    }
}

describe("FEAT-0023 — an epoch change clears every open position dialog", () => {
    it("control: all five dialogs open and stay open without a rotation", async () => {
        await mountWithAllDialogsOpen();

        expect(probeCount()).toBe(5);
        await settle();
        expect(probeCount()).toBe(5);
    });

    it("rotating the epoch closes every dialog by clearing its id", async () => {
        await mountWithAllDialogsOpen();
        expect(probeCount()).toBe(5);

        // What a provider change runs: provider setter → providerChanged →
        // accountSession.reset → accountEpoch.rotate → this effect.
        accountEpoch.rotate("venue-switch");
        await settle();

        expect(probeCount()).toBe(0);
    });
});
