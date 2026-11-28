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

import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import {
  computeGridPreview,
  deriveGridChartLevels,
  extractStopOutPrice,
  parseGridOrderClientId,
  suggestGridLevelsFromAtr,
} from "./gridEditorPreview";
import type { Condition, EvaluationCandle, GridDocument } from "../rules/types";

function priceStopOut(value: string, op: "lte" | "gte" = "lte"): Condition {
  return {
    kind: "compare",
    left: { kind: "price", field: "close" },
    op,
    right: { kind: "constant", value },
    timeframe: "1h",
  };
}

function sampleGrid(overrides: Partial<GridDocument> = {}): GridDocument {
  return {
    kind: "grid",
    schema_version: 1,
    id: "grid-alpha",
    name: "BTC Range",
    symbol: "BTCUSDT",
    side: "long",
    evaluation_timeframe: "1h",
    lower_price: "90000",
    upper_price: "100000",
    level_count: 5,
    spacing: "arithmetic",
    sizing: { basis: "quote_budget", amount: "1000" },
    stop_out: [priceStopOut("85000")],
    consequence_level: "simulate",
    enabled: true,
    provenance: { source: "human", created_at_ms: 1700000000000 },
    ...overrides,
  };
}

describe("gridEditorPreview — computeGridPreview", () => {
  it("flags spacingBelowFee when narrowest spacing does not exceed round-trip taker fee", () => {
    // 6 bps taker fee => minimumViableSpacing = 2 * 0.0006 / (1 - 0.0006) ≈ 0.12007%
    const res = computeGridPreview({
      side: "long",
      lowerPrice: "100000",
      upperPrice: "100200",
      levelCount: 5, // 40 per step => 0.04% < 0.12%
      spacing: "arithmetic",
      budgetAmount: "1000",
      stopOut: [priceStopOut("99000")],
      feeRate: new Decimal("0.0006"),
      accountEquity: new Decimal("10000"),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.spacingBelowFee).toBe(true);
    expect(res.minViableSpacingPct?.toDecimalPlaces(4).toString()).toBe("0.1201");
  });

  it("clears spacingBelowFee when spacing comfortably exceeds round-trip taker fee", () => {
    const res = computeGridPreview({
      side: "long",
      lowerPrice: "90000",
      upperPrice: "100000",
      levelCount: 5, // ~2% spacing > 0.12%
      spacing: "arithmetic",
      budgetAmount: "1000",
      stopOut: [priceStopOut("85000")],
      feeRate: new Decimal("0.0006"),
      accountEquity: new Decimal("10000"),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.spacingBelowFee).toBe(false);
    // TruncatingDecimal splits budget with ROUND_DOWN so notional never exceeds 1000
    expect(res.exposure.notional.lte(1000)).toBe(true);
    expect(res.exposure.notional.toDecimalPlaces(2).toString()).toBe("1000");
    expect(res.exposure.openFees.toDecimalPlaces(2).toString()).toBe("0.6");
    expect(res.exposure.reserveWithFees.toDecimalPlaces(2).toString()).toBe("1000.6");
    expect(res.worstCase?.loss.gt(0)).toBe(true);
    expect(res.worstCaseSharePct?.gt(0)).toBe(true);
  });

  it("reports inward bound rounding when priceStep moves lower up or upper down", () => {
    const res = computeGridPreview({
      side: "long",
      lowerPrice: "100.03",
      upperPrice: "110.97",
      levelCount: 4,
      spacing: "arithmetic",
      budgetAmount: "400",
      stopOut: [priceStopOut("95")],
      feeRate: new Decimal("0.0006"),
      accountEquity: new Decimal("10000"),
      priceStep: new Decimal("0.5"),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.lowerMovedInward).toBe(true);
    expect(res.upperMovedInward).toBe(true);
    expect(res.effectiveLower.toString()).toBe("100.5");
    expect(res.effectiveUpper.toString()).toBe("110.5");
  });

  it("returns null stopOutPrice when stop_out uses only non-price conditions", () => {
    const nonPrice: Condition = {
      kind: "account",
      field: "unrealised_pnl",
      op: "lte",
      value: "-200",
    };
    expect(extractStopOutPrice("long", [nonPrice])).toBeNull();
  });
});

describe("gridEditorPreview — suggestGridLevelsFromAtr", () => {
  it("computes an ATR(14) spacing suggestion from closed candles without mutating inputs", () => {
    const candles: EvaluationCandle[] = Array.from({ length: 20 }, (_, idx) => ({
      open_time_ms: (idx + 1) * 3_600_000,
      open: "95000",
      high: "96000",
      low: "94000", // True range = 2000 per candle
      close: "95000",
      volume: "10",
    }));
    const suggestion = suggestGridLevelsFromAtr({
      lowerPrice: "90000",
      upperPrice: "100000",
      spacing: "arithmetic",
      timeframe: "1h",
      candles,
      feeRate: new Decimal("0.0006"),
    });
    expect(suggestion).not.toBeNull();
    expect(suggestion?.atr.toString()).toBe("2000");
    expect(suggestion?.suggestedLevels).toBe(5);
    expect(suggestion?.stepAmount.toString()).toBe("2000");
  });

  it("returns null before ATR warmup has enough candles", () => {
    const candles: EvaluationCandle[] = Array.from({ length: 5 }, (_, idx) => ({
      open_time_ms: (idx + 1) * 60_000,
      open: "100",
      high: "102",
      low: "98",
      close: "100",
    }));
    expect(
      suggestGridLevelsFromAtr({
        lowerPrice: "90",
        upperPrice: "110",
        spacing: "arithmetic",
        timeframe: "1m",
        candles,
        feeRate: new Decimal("0.0006"),
      }),
    ).toBeNull();
  });
});

describe("gridEditorPreview — parseGridOrderClientId & deriveGridChartLevels", () => {
  it("parses deterministic grid slot client order IDs and rejects manual IDs", () => {
    expect(parseGridOrderClientId("grid:g-1:s3:open")).toEqual({
      gridId: "g-1",
      slotIndex: 3,
      leg: "open",
    });
    expect(parseGridOrderClientId("grid:g-1:s0:close")).toEqual({
      gridId: "g-1",
      slotIndex: 0,
      leg: "close",
    });
    expect(parseGridOrderClientId("manual-order-1")).toBeNull();
  });

  it("renders all level_count + 1 lines for active/paused grids, marks filled levels, and clears on stop", () => {
    const grid = sampleGrid({ level_count: 4, lower_price: "90000", upper_price: "98000" });
    const activeLevels = deriveGridChartLevels({
      grid,
      status: "active",
      openSlots: [1],
      restingClientIds: new Set(["grid:grid-alpha:s2:close"]),
    });
    expect(activeLevels).toHaveLength(5);
    expect(activeLevels.map((l) => l.price.toString())).toEqual([
      "90000",
      "92000",
      "94000",
      "96000",
      "98000",
    ]);
    // Long grid: slot 1 opens on line 1 (92000) and slot 2 opens on line 2 (94000)
    expect(activeLevels.map((l) => l.filled)).toEqual([false, true, true, false, false]);

    expect(deriveGridChartLevels({ grid, status: "closed", openSlots: [1] })).toEqual([]);
    expect(
      deriveGridChartLevels({ grid, status: "account_unavailable", openSlots: [1] }),
    ).toEqual([]);
  });
});
