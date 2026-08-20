// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * FEAT-0229's last acceptance criterion: the refusal reaches the trader as
 * language, in the toast, naming the venue and what it cannot do.
 *
 * The other tests prove the parts. This one proves the chain, and it mocks as
 * little as possible to do it: the real `bitgetAdapter` refuses, the real
 * `ExchangeUnsupportedError` travels, the real `getDisplayMessage` translates
 * it, and the translation is looked up in the real `en.json`. Only the things
 * a test cannot have are replaced — the network transport, the settings store,
 * the socket, and `confirm()`.
 *
 * Mounting a component is new for this repo (it tests services and stores).
 * It is warranted here because the criterion is specifically about the wiring
 * between a component's catch block and the toast, which is exactly what a
 * service-level test cannot see. Svelte 5's own `mount` is used rather than a
 * new testing dependency.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** Bitget selected — the venue whose adapter declares no TP/SL. */
const settings = vi.hoisted(() => ({ apiProvider: "bitget" as string }));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

vi.mock("../../services/bitgetWs", () => ({
    bitgetWs: { subscribe: vi.fn(), unsubscribe: vi.fn() },
}));
vi.mock("../../services/bitunixWs", () => ({
    bitunixWs: { subscribe: vi.fn(), unsubscribe: vi.fn(), subscribeTrade: vi.fn(() => vi.fn()) },
}));
vi.mock("../../services/apiService", () => ({
    apiService: {
        fetchTicker24h: vi.fn(),
        fetchMarketSnapshot: vi.fn(async () => []),
        fetchBitunixKlines: vi.fn(async () => []),
        fetchBitgetKlines: vi.fn(async () => []),
        fetchBitunixFundingRateHistory: vi.fn(async () => []),
    },
}));

/** The transport. If the adapter's guard fails, this is what would be hit. */
const tradeServiceMock = vi.hoisted(() => ({
    cancelTpSlOrder: vi.fn(async () => ({ ok: true })),
    modifyTpSlOrder: vi.fn(async () => ({ ok: true })),
    fetchTpSlOrders: vi.fn(async () => []),
    placeOrder: vi.fn(),
    closePosition: vi.fn(),
    cancelOrder: vi.fn(),
    cancelAllOrders: vi.fn(),
    modifyOrder: vi.fn(),
    fetchLeverageMarginMode: vi.fn(),
    fetchTradingPairInfo: vi.fn(),
}));
vi.mock("../../services/tradeService", () => ({
    tradeService: tradeServiceMock,
    // The component imports the type only, but the module is also where
    // OrderRefusedError's sibling error types live for other importers.
    BitunixApiError: class extends Error { },
}));

const toastMock = vi.hoisted(() => ({
    error: vi.fn(),
    success: vi.fn(),
    add: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
}));
vi.mock("../../services/toastService.svelte", () => ({ toastService: toastMock }));

/** One resting plan, so the list renders a cancel button to click. */
const PLAN = {
    orderId: "plan-1",
    symbol: "BTCUSDT",
    planType: "LOSS" as const,
    triggerPrice: "50000",
    status: "NEW",
    ctime: 1_700_000_000_000,
};
vi.mock("../../stores/tpsl.svelte", () => ({
    tpSlState: {
        get orders() {
            return [PLAN];
        },
        error: null,
        ensureFresh: vi.fn(async () => undefined),
        invalidate: vi.fn(),
    },
}));

/*
 * svelte-i18n resolved against the real English catalogue, so the assertion
 * below is about the string a user actually sees rather than a key.
 */
function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}
vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string, options?: { values?: Record<string, unknown> }) => {
            const template = lookup(key) ?? key;
            if (!options?.values) return template;
            return Object.entries(options.values).reduce(
                (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
                template,
            );
        }),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

import TpSlList from "./TpSlList.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    settings.apiProvider = "bitget";
    vi.stubGlobal("confirm", () => true);
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    vi.unstubAllGlobals();
});

/**
 * Lets Svelte's effects and the handler's promise chain finish. Effects are
 * scheduled, not synchronous, and `fetchOrders` awaits the store before it
 * assigns — so one microtask is not enough, and a fixed sleep would be a
 * flake waiting to happen.
 */
async function settle(rounds = 8) {
    for (let i = 0; i < rounds; i++) {
        flushSync();
        await Promise.resolve();
    }
    flushSync();
}

/** The cancel control of the first rendered plan. */
function cancelButton(host: HTMLElement): HTMLButtonElement | null {
    return host.querySelector<HTMLButtonElement>(
        `[title="${lookup("dashboard.tpslManager.cancelTooltip")}"]`,
    );
}

async function renderWithOnePlan(host: HTMLElement) {
    const component = mount(TpSlList, { target: host, props: { isActive: true } });
    await settle();
    const button = cancelButton(host);
    expect(button, `the pending list rendered no cancel control:\n${host.innerHTML}`).not.toBeNull();
    return { component, button: button! };
}

describe("FEAT-0229 — the refusal reaches the trader through the toast", () => {
    it("shows what Bitget cannot do, instead of a generic failure", async () => {
        const { component: mounted, button } = await renderWithOnePlan(host);
        component = mounted as never;

        button.click();
        await settle();

        expect(toastMock.error).toHaveBeenCalledTimes(1);
        const shown = String(toastMock.error.mock.calls[0][0]);

        // The venue, capitalised for display, and the real English sentence —
        // not the i18n key, and not "cancel failed".
        expect(shown).toContain("Bitget");
        expect(shown).toBe(lookup("exchange.unsupported.tpSl").replace("{exchange}", "Bitget"));
        expect(shown).not.toContain("exchange.unsupported");
        expect(shown).not.toBe(lookup("dashboard.alerts.cancelFailed"));
    });

    it("sends nothing to the transport when the trader clicks cancel", async () => {
        const { component: mounted, button } = await renderWithOnePlan(host);
        component = mounted as never;

        button.click();
        await settle();

        // The whole point of the item, asserted from the UI end this time.
        expect(tradeServiceMock.cancelTpSlOrder).not.toHaveBeenCalled();
        expect(toastMock.success).not.toHaveBeenCalled();
    });

    it("still cancels normally on a venue that supports it", async () => {
        settings.apiProvider = "bitunix";
        const { component: mounted, button } = await renderWithOnePlan(host);
        component = mounted as never;

        button.click();
        await settle();

        expect(tradeServiceMock.cancelTpSlOrder).toHaveBeenCalledTimes(1);
        expect(toastMock.error).not.toHaveBeenCalled();
        expect(toastMock.success).toHaveBeenCalledTimes(1);
    });
});
