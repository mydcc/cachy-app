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
 * BUG-0501 — instrument metadata is a precondition, not an optimisation.
 *
 * Without metadata no rounding, no volume check and no leverage check can
 * run, so the calculator must emit no orderable size and surface the reason
 * instead of a number that skipped its guards. Driven through the real
 * `app.calculateAndDisplay` into the real stores: the criterion is what the
 * panel would show, not what a private method returns.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Decimal } from "decimal.js";
import { tradeState, INITIAL_TRADE_STATE } from "../stores/trade.svelte";
import { resultsState } from "../stores/results.svelte";
import { settingsState } from "../stores/settings.svelte";
import { marketState, type TradingPairInfo } from "../stores/market.svelte";
import { uiState } from "../stores/ui.svelte";
import { app } from "./app";

vi.mock("../stores/ui.svelte", () => ({
    uiState: {
        showError: vi.fn(),
        showFeedback: vi.fn(),
        update: vi.fn(),
        hideError: vi.fn(),
        setSyncProgress: vi.fn(),
    },
}));

vi.mock("./apiService", () => ({
    apiService: {
        fetchBitunixKlines: vi.fn(),
        fetchBitunixPrice: vi.fn(),
        fetchTicker24h: vi.fn(),
    },
}));

function seedTrade(over: Record<string, unknown> = {}) {
    const state = JSON.parse(JSON.stringify(INITIAL_TRADE_STATE));
    tradeState.set({
        ...state,
        symbol: "BTCUSDT",
        tradeType: "long",
        accountSize: "10000",
        riskPercentage: "1",
        entryPrice: "50000",
        stopLossPrice: "49500",
        leverage: "10",
        useAtrSl: false,
        isRiskAmountLocked: false,
        isPositionSizeLocked: false,
        targets: [],
        ...over,
    });
}

function seedMeta(key: string, over: Partial<TradingPairInfo> = {}) {
    marketState.setSymbolMeta(key, {
        symbol: key,
        basePrecision: 4,
        quotePrecision: 2,
        minTradeVolume: new Decimal("0.0001"),
        maxLimitOrderVolume: new Decimal("100000"),
        maxMarketOrderVolume: new Decimal("50000"),
        minLeverage: 1,
        maxLeverage: 125,
        defaultLeverage: 20,
        priceProtectScope: null,
        symbolStatus: "OPEN",
        isApiSupported: true,
        ...over,
    });
}

const showError = () => vi.mocked(uiState.showError);

beforeEach(() => {
    vi.clearAllMocks();
    marketState.reset();
    settingsState.apiProvider = "bitunix";
    seedTrade();
});

afterEach(() => {
    settingsState.apiProvider = "bitunix";
    marketState.reset();
});

describe("BUG-0501 — no metadata, no orderable size", () => {
    it("emits no size and surfaces the reason when the symbol has no entry", () => {
        // 10000 USDT, 1 % risk, 500 stop distance → 0.2 BTC unguarded.
        app.calculateAndDisplay();

        expect(resultsState.positionSize).toBe("-");
        expect(resultsState.requiredMargin).toBe("-");
        expect(showError()).toHaveBeenCalledTimes(1);
    });

    it("emits no size when the entry lacks a precision", () => {
        marketState.setSymbolMeta("BTCUSDT", {
            symbol: "BTCUSDT",
            minTradeVolume: new Decimal("0.0001"),
        } as TradingPairInfo);
        app.calculateAndDisplay();

        expect(resultsState.positionSize).toBe("-");
        expect(showError()).toHaveBeenCalledTimes(1);
    });

    it("refuses a size below the instrument minimum", () => {
        seedMeta("BTCUSDT", { minTradeVolume: new Decimal("1") });
        app.calculateAndDisplay();

        expect(resultsState.positionSize).toBe("-");
        expect(showError()).toHaveBeenCalledTimes(1);
    });

    it("refuses a size above the instrument maximum", () => {
        seedMeta("BTCUSDT", { maxMarketOrderVolume: new Decimal("0.01") });
        app.calculateAndDisplay();

        expect(resultsState.positionSize).toBe("-");
        expect(showError()).toHaveBeenCalledTimes(1);
    });

    it("refuses leverage above the instrument maximum", () => {
        seedMeta("BTCUSDT", { maxLeverage: 5 });
        seedTrade({ leverage: "10" });
        app.calculateAndDisplay();

        expect(resultsState.positionSize).toBe("-");
        expect(showError()).toHaveBeenCalledTimes(1);
    });

    it("still sizes when every guard passes", () => {
        seedMeta("BTCUSDT");
        app.calculateAndDisplay();

        // 100 risk / 500 distance = 0.2, already step-aligned.
        expect(resultsState.positionSize).toBe("0.2");
        expect(showError()).not.toHaveBeenCalled();
    });
});

describe("BUG-0501 — venue-aware metadata", () => {
    it("rounds a Bitget symbol down to that venue's precision", () => {
        settingsState.apiProvider = "bitget";
        // Only the venue-normalized key exists — a Bitunix-shaped lookup
        // would miss it and refuse (or, before the fix, skip the rounding).
        seedMeta("BTCUSDT_UMCBL", { basePrecision: 4 });
        // 100 risk / 810 distance = 0.12345679… → 0.1234 down, never 0.1235.
        seedTrade({ entryPrice: "50000", stopLossPrice: "49190" });
        app.calculateAndDisplay();

        expect(resultsState.positionSize).toBe("0.1234");
        expect(showError()).not.toHaveBeenCalled();
    });

    it("does not serve a Bitunix entry for a Bitget symbol", () => {
        settingsState.apiProvider = "bitget";
        seedMeta("BTCUSDT");
        app.calculateAndDisplay();

        expect(resultsState.positionSize).toBe("-");
        expect(showError()).toHaveBeenCalledTimes(1);
    });

    it("does not serve a Bitget entry for a Bitunix symbol", () => {
        seedMeta("BTCUSDT_UMCBL");
        app.calculateAndDisplay();

        expect(resultsState.positionSize).toBe("-");
        expect(showError()).toHaveBeenCalledTimes(1);
    });
});

describe("BUG-0559 — an unreadable direction fails closed", () => {
    it("emits no size when the persisted direction is not long or short", () => {
        seedTrade({ tradeType: "sideways" });
        app.calculateAndDisplay();

        expect(resultsState.positionSize).toBe("-");
        expect(showError()).toHaveBeenCalledTimes(1);
    });
});
