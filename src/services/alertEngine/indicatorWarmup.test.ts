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

/**
 * The warmup table is what both the parity sweep and the recorded-history suite
 * trust to say from which candle an indicator has a value. These pin it to the
 * series it describes, so a number that promises a value too early fails here
 * rather than letting a suite assert inside a warmup.
 *
 * Only that direction is pinned. An entry may ask for more than the alert path
 * needs, and several do on purpose: `needs` is also what WASM's `initialize`
 * requires, which for an indicator's lines is the deepest of them (the MACD
 * line has its first value eight candles before its entry's 34).
 */

import { describe, expect, it } from "vitest";

import { computeIndicatorSeries } from "../../lib/rules/indicatorSeries";
import { RECORDED_CANDLES, RECORDED_TIMEFRAME } from "../__fixtures__/recordedSeries";
import { INDICATOR_WARMUP, assertableFrom, warmupFor } from "./indicatorWarmup";

describe("the indicator warmup table", () => {
  it.each(INDICATOR_WARMUP.map((w) => [w.label, w] as const))(
    "%s has a value by the candle the table names",
    (_label, w) => {
      const result = computeIndicatorSeries({ indicator: w.ref, timeframe: RECORDED_TIMEFRAME }, RECORDED_CANDLES);
      if (!result.supported) throw new Error(result.reason);
      const first = result.values.findIndex((v) => v !== null);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThanOrEqual(w.needs - 1);
    },
  );

  it("answers for the line a condition reads, not for the first line of its indicator", () => {
    const params = { conversion_period: 9, base_period: 26, span_b_period: 52 };
    expect(warmupFor({ id: "ichimoku", params, output: "conversion" })).toBe(9);
    expect(warmupFor({ id: "ichimoku", params, output: "span_b" })).toBe(78);
    expect(assertableFrom([{ id: "ichimoku", params, output: "span_b" }])).toBe(78 * 3);
  });

  it("reads a reference without an output as the single line it names", () => {
    expect(warmupFor({ id: "rsi", params: { period: 14 } })).toBe(15);
    expect(warmupFor({ id: "rsi", params: { period: 14 }, output: "value" })).toBe(15);
  });
});
