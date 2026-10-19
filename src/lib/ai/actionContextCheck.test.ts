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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * BUG-0704 — the confirmation block must be able to say "this price is not in
 * the context" before the user applies it. The cases below are the ones the
 * guard exists for: rounding a real level (must pass), inventing one (must
 * flag), and collapsing a sub-cent price by two decimal places (must flag).
 */

import { describe, expect, it } from "vitest";
import {
  PRICE_MATCH_TOLERANCE,
  findUnverifiedPrices,
  type PriceCheckContext,
} from "./actionContextCheck";

/** Shaped like the context `gatherContext()` hands to the model. */
function context(
  overrides: Partial<PriceCheckContext> = {},
): PriceCheckContext {
  return {
    REAL_TIME_PRICE: "81859.7",
    marketDetails: {
      currentPrice: "81859.7",
      high24h: "83142.4",
      low24h: "80627",
    },
    technicals: {
      summary: "Strong Sell",
      oscillators: { "RSI": "44.53", "Stoch.RSI": "10.25", "CCI": "-42.04" },
      movingAverages: [
        { name: "EMA20", value: "82209.4676", action: "Sell" },
        { name: "EMA50", value: "81976.6222", action: "Sell" },
      ],
      pivots: { classic: { pivot: "82278.6333", s1: "81820.2667" } },
    },
    tradeSetup: {},
    openPositions: [],
    ...overrides,
  };
}

describe("findUnverifiedPrices", () => {
  it("accepts a level straight out of the context", () => {
    expect(
      findUnverifiedPrices(
        [{ action: "setEntryPrice", value: "82209.4676" }],
        context(),
      ),
    ).toEqual([]);
  });

  it("accepts a context level rounded to two decimals", () => {
    // 82209.4676 → 82209.47 is 0.000003 %, far inside the tolerance.
    expect(
      findUnverifiedPrices(
        [{ action: "setStopLoss", value: "82209.47" }],
        context(),
      ),
    ).toEqual([]);
  });

  it("accepts the live price and the 24h high", () => {
    expect(
      findUnverifiedPrices(
        [
          { action: "setEntryPrice", value: "81859.7" },
          { action: "setStopLoss", value: "80627" },
          { action: "setTakeProfit", index: 0, value: "83142.4" },
        ],
        context(),
      ),
    ).toEqual([]);
  });

  it("flags a level the context never had", () => {
    expect(
      findUnverifiedPrices(
        [{ action: "setEntryPrice", value: "80000" }],
        context(),
      ),
    ).toEqual([{ action: "setEntryPrice", value: "80000" }]);
  });

  it("flags a sub-cent price rounded to two decimals", () => {
    // 0.0123456 → 0.01 is a 19 % error; the old shape check let it through.
    const subCent = context({
      REAL_TIME_PRICE: "0.0123456",
      marketDetails: { currentPrice: "0.0123456", high24h: "0.0131" },
      technicals: null,
    });
    expect(
      findUnverifiedPrices(
        [{ action: "setEntryPrice", value: "0.01" }],
        subCent,
      ),
    ).toEqual([{ action: "setEntryPrice", value: "0.01" }]);
    expect(
      findUnverifiedPrices(
        [{ action: "setEntryPrice", value: "0.0123456" }],
        subCent,
      ),
    ).toEqual([]);
  });

  it("does not let a percentage vouch for a sub-cent price", () => {
    // RSI 44.53 sits nowhere near 0.0123, but only the band keeps the
    // magnitudes from colliding on a cheap asset.
    const subCent = context({
      REAL_TIME_PRICE: "0.0123456",
      marketDetails: { currentPrice: "0.0123456" },
      technicals: { oscillators: { RSI: "44.53" } },
    });
    expect(
      findUnverifiedPrices(
        [{ action: "setEntryPrice", value: "44.53" }],
        subCent,
      ),
    ).toEqual([{ action: "setEntryPrice", value: "44.53" }]);
  });

  it("carries the take-profit index so the row can be named", () => {
    expect(
      findUnverifiedPrices(
        [{ action: "setTakeProfit", index: 1, value: "70000" }],
        context(),
      ),
    ).toEqual([{ action: "setTakeProfit", index: 1, value: "70000" }]);
  });

  it("keeps the tolerance relative to the context level", () => {
    expect(PRICE_MATCH_TOLERANCE).toBe(0.001);
    // A context with one level, so a match cannot come from a neighbour.
    const oneLevel = context({
      REAL_TIME_PRICE: "100000",
      marketDetails: { currentPrice: "100000" },
      technicals: null,
    });
    expect(
      findUnverifiedPrices(
        [{ action: "setEntryPrice", value: "100050" }],
        oneLevel,
      ),
    ).toEqual([]);
    expect(
      findUnverifiedPrices(
        [{ action: "setEntryPrice", value: "100200" }],
        oneLevel,
      ),
    ).toHaveLength(1);
  });

  it("stays silent when there is nothing to compare against", () => {
    // A context timeout or an empty context is not evidence of a wrong
    // value; a warning on every action would train the user to ignore it.
    expect(
      findUnverifiedPrices([{ action: "setEntryPrice", value: "12345" }], null),
    ).toEqual([]);
    expect(
      findUnverifiedPrices([{ action: "setEntryPrice", value: "12345" }], {}),
    ).toEqual([]);
  });

  it("ignores actions that carry no price", () => {
    expect(
      findUnverifiedPrices(
        [
          { action: "setLeverage", value: "10" },
          { action: "setRisk", value: "2" },
          { action: "setTakeProfit", index: 0, percent: "50" },
          { action: "setNotes", value: "check the range" },
        ],
        context(),
      ),
    ).toEqual([]);
  });
});
