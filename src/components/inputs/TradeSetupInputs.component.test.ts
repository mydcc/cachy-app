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
 * FEAT-0346 — TradeSetupInputs is the entry point of every calculation: the
 * symbol and the entry/stop prices the rest of the app sizes against. The
 * tests pin the input contract — the field keeps what was typed, only a
 * complete decimal reaches the store, and the symbol/ATR controls call back
 * rather than acting on their own.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

const tradeStateMock = vi.hoisted(() => {
    const state: Record<string, unknown> = {
        symbol: "BTCUSDT",
        entryPrice: "50000",
        stopLossPrice: "48000",
        useAtrSl: false,
        atrMode: "auto",
        atrValue: "500",
        atrMultiplier: "2",
        isPositionSizeLocked: false,
        lockedPositionSize: null,
    };
    state.update = vi.fn((fn: (s: Record<string, unknown>) => Record<string, unknown>) => {
        Object.assign(state, fn({ ...state }));
    });
    return state;
});
vi.mock("../../stores/trade.svelte", () => ({ tradeState: tradeStateMock }));

const settingsMock = vi.hoisted(() => ({
    autoUpdatePriceInput: false,
    showTooltips: false,
    favoriteTimeframes: [] as string[],
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settingsMock }));

vi.mock("../../stores/market.svelte", () => ({
    marketState: { data: {}, symbolMeta: {} },
}));
vi.mock("../../stores/ui.svelte", () => ({ uiState: { showError: vi.fn() } }));
vi.mock("../../stores/results.svelte", () => ({ resultsState: { positionSize: "" } }));

vi.mock("../../services/fundingRateService.svelte", () => ({
    fundingRateService: { historyState: {}, fetchHistory: vi.fn(async () => undefined) },
}));
vi.mock("../../services/trackingService", () => ({ trackCustomEvent: vi.fn() }));
vi.mock("../../services/onboardingService", () => ({
    onboardingService: { trackFirstInput: vi.fn() },
}));
vi.mock("../../services/app", () => ({
    app: {
        fetchAllAnalysisData: vi.fn(async () => undefined),
        updateSymbolSuggestions: vi.fn(),
    },
}));

vi.mock("../../utils/symbolUtils", () => ({ normalizeSymbol: (s: string) => s }));
vi.mock("../../utils/inputUtils", () => ({ numberInput: () => ({ destroy() {} }) }));
vi.mock("../../lib/actions/inputEnhancements", () => ({
    enhancedInput: () => ({ destroy() {} }),
}));
vi.mock("../../lib/actions/portal", () => ({ portal: () => ({ destroy() {} }) }));
vi.mock("../../utils/utils", () => ({
    debounce: (fn: (...args: unknown[]) => void) => {
        const wrapped = (...args: unknown[]) => fn(...args);
        wrapped.cancel = () => {};
        return wrapped;
    },
    formatDynamicDecimal: (value: unknown) =>
        value == null ? "-" : String(value instanceof Object ? value.toString() : value),
}));

vi.mock("../../lib/windows/WindowManager.svelte", () => ({
    windowManager: { open: vi.fn() },
}));
vi.mock("../../lib/windows/implementations/SymbolPickerWindow.svelte", () => ({
    SymbolPickerWindow: class {},
}));

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return { _: r((key: string) => key), locale: r("en"), setLocale: vi.fn() };
});

import TradeSetupInputs from "./TradeSetupInputs.svelte";

const BASE_PROPS = {
    symbol: "BTCUSDT",
    entryPrice: "50000",
    useAtrSl: false,
    atrValue: "500",
    atrMultiplier: "2",
    stopLossPrice: "48000",
    atrMode: "auto" as const,
    atrTimeframe: "1h",
    atrFormulaDisplay: "",
    showAtrFormulaDisplay: false,
    isPriceFetching: false,
    isAtrFetching: false,
    symbolSuggestions: [] as string[],
    showSymbolSuggestions: false,
};

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    tradeStateMock.entryPrice = "50000";
    tradeStateMock.symbol = "BTCUSDT";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(overrides: Record<string, unknown> = {}) {
    component = mount(TradeSetupInputs, {
        target: host,
        props: { ...BASE_PROPS, ...overrides },
    }) as never;
    flushSync();
}

function input(id: string): HTMLInputElement {
    const el = host.querySelector<HTMLInputElement>(`#${id}`);
    if (!el) throw new Error(`#${id} not rendered`);
    return el;
}

function typeInto(el: HTMLInputElement, value: string) {
    el.dispatchEvent(new Event("focus"));
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
}

describe("FEAT-0346 — TradeSetupInputs feeds only complete numbers to the store", () => {
    it("renders the symbol, entry and stop-loss values it was given", () => {
        render();

        expect(input("symbol-input").value).toBe("BTCUSDT");
        expect(input("entry-price-input").value).toBe("50000");
        expect(input("stop-loss-price-input").value).toBe("48000");
    });

    it("writes a valid entry price into the trade store", () => {
        render();

        typeInto(input("entry-price-input"), "51234.5");

        expect(tradeStateMock.entryPrice).toBe("51234.5");
    });

    it("holds back a number that is still being typed", () => {
        render();

        typeInto(input("entry-price-input"), "123.");

        // A trailing dot is a complete decimal only in the user's head; the
        // store must not receive "123." as a price.
        expect(tradeStateMock.entryPrice).toBe("50000");
        expect(input("entry-price-input").value).toBe("123.");
    });

    it("routes the ATR stop-loss switch through its callback", () => {
        const ontoggleatrinputs = vi.fn();
        render({ ontoggleatrinputs });

        input("use-atr-sl-checkbox").click();

        expect(ontoggleatrinputs).toHaveBeenCalledTimes(1);
        expect(typeof ontoggleatrinputs.mock.calls[0][0]).toBe("boolean");
    });

    it("selects a symbol suggestion through its callback", () => {
        const onselectsymbolsuggestion = vi.fn();
        render({
            symbolSuggestions: ["ETHUSDT"],
            showSymbolSuggestions: true,
            onselectsymbolsuggestion,
        });

        const suggestion = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(
            (el) => el.textContent?.trim() === "ETHUSDT",
        );
        expect(suggestion).toBeTruthy();
        suggestion?.click();

        expect(onselectsymbolsuggestion).toHaveBeenCalledWith("ETHUSDT");
    });
});
