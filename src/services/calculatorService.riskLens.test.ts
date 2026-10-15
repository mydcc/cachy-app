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
 * The risk lens (`lib/risk.ts`) and `CalculatorService.performCalculation`
 * implement the same mode table from opposite sides: the lens for display
 * and the staleness gate, the service for the metrics. Both must agree
 * bit-for-bit, because the gate compares with exact `Decimal.eq` — a
 * reordered operation on either side would refuse orders with no recovery
 * input. These cases drive the real `app.calculateAndDisplay` and assert
 * the sided figures equal the lens for a shared table, including repeating
 * decimals and both fallback rows.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Decimal } from "decimal.js";
import { tradeState, INITIAL_TRADE_STATE } from "../stores/trade.svelte";
import { resultsState } from "../stores/results.svelte";
import { settingsState } from "../stores/settings.svelte";
import { marketState, type TradingPairInfo } from "../stores/market.svelte";
import { app } from "./app";
import { effectiveRiskPercentage } from "../lib/risk";

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

function seedMeta() {
  marketState.setSymbolMeta("BTCUSDT", {
    symbol: "BTCUSDT",
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
  } as TradingPairInfo);
}

function seed(over: Record<string, unknown> = {}) {
  tradeState.set({
    ...INITIAL_TRADE_STATE,
    symbol: "BTCUSDT",
    tradeType: "long",
    accountSize: "10000",
    riskPercentage: "1",
    riskAmount: null,
    entryPrice: "50000",
    stopLossPrice: "49500",
    leverage: "10",
    useAtrSl: false,
    isRiskAmountLocked: false,
    isPositionSizeLocked: false,
    lockedPositionSize: null,
    targets: [],
    ...over,
  });
}

beforeEach(() => {
  marketState.reset();
  settingsState.apiProvider = "bitunix";
  seedMeta();
});

afterEach(() => {
  settingsState.apiProvider = "bitunix";
  marketState.reset();
});

describe("risk lens agrees with the calculator", () => {
  it("matches in unlocked mode", () => {
    seed({ riskPercentage: "2" });
    app.calculateAndDisplay();

    const data = tradeState.currentTradeData;
    expect(data?.riskPercentage.eq(new Decimal("2"))).toBe(true);
    expect(data?.riskPercentage.eq(effectiveRiskPercentage(tradeState))).toBe(true);
  });

  it("matches for an amount lock, including repeating decimals", () => {
    seed({ isRiskAmountLocked: true, riskAmount: "1000", accountSize: "30000" });
    app.calculateAndDisplay();

    const data = tradeState.currentTradeData;
    // 1000 / 30000 * 100 = 3.333… — exact-eq pins the op order on both sides.
    expect(data?.riskPercentage.toString()).toBe(
      effectiveRiskPercentage(tradeState).toString(),
    );
    expect(data?.riskPercentage.eq(new Decimal("1000").div("30000").times(100))).toBe(true);
    // The stored percentage is not the edited side: it stays untouched.
    expect(tradeState.riskPercentage).toBe("1");
  });

  it("falls back to the stored percentage for a non-positive locked amount", () => {
    seed({ isRiskAmountLocked: true, riskAmount: "0", riskPercentage: "1.5" });
    app.calculateAndDisplay();

    const data = tradeState.currentTradeData;
    expect(data?.riskPercentage.eq(new Decimal("1.5"))).toBe(true);
    expect(data?.riskPercentage.eq(effectiveRiskPercentage(tradeState))).toBe(true);
  });

  it("matches for a locked position size", () => {
    seed({
      isPositionSizeLocked: true,
      lockedPositionSize: new Decimal("0.2"),
    });
    app.calculateAndDisplay();

    const data = tradeState.currentTradeData;
    // |50000 - 49500| * 0.2 = 100, 1% of 10000.
    expect(data?.riskPercentage.eq(new Decimal("1"))).toBe(true);
    expect(data?.riskPercentage.eq(effectiveRiskPercentage(tradeState))).toBe(true);
    expect(tradeState.riskPercentage).toBe("1");
    expect(resultsState.positionSize).toBe("0.2");
  });
});
