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
 * BUG-0704 — the confirmation block must be able to say "the context cannot
 * confirm this price" before the user applies it. The cases below pin the
 * three things that make the verdict trustworthy: only real levels are
 * candidates (not volume, an RSI or a percentage), the number checked is the
 * number executed (k/m suffixes), and a context without prices says so
 * instead of staying silent.
 */

import { describe, expect, it } from "vitest";
import {
  PRICE_MATCH_TOLERANCE,
  checkActionPrices,
  type PriceCheckContext,
} from "./actionContextCheck";
import {
  AI_ACTION_CATALOG,
  AI_PRICE_ACTIONS,
  isKnownAiAction,
  requiresConfirmation,
} from "./actionPolicy";

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
      volume24h: "21622.5",
      orderbook: {
        topBids: [81850.1, 81840.2],
        topAsks: [81860.3, 81870.4],
      },
    },
    technicals: {
      summary: "Strong Sell",
      oscillators: { "RSI": "44.53", "Stoch.RSI": "10.25", "CCI": "-42.04" },
      movingAverages: [
        { name: "EMA20", value: "82209.4676", action: "Sell" },
        { name: "EMA50", value: "81976.6222", action: "Sell" },
      ],
      pivots: { classic: { pivot: "82278.6333", s1: "81820.2667" } },
      divergences: [{ priceStart: "82856.4", priceEnd: "83142.4" }],
    },
    tradeSetup: {},
    openPositions: [],
    ...overrides,
  };
}

describe("checkActionPrices", () => {
  it("accepts a level straight out of the context", () => {
    expect(
      checkActionPrices(
        [{ action: "setEntryPrice", value: "82209.4676" }],
        context(),
      ),
    ).toEqual({ unverified: [], checked: true });
  });

  it("accepts a context level rounded to two decimals", () => {
    // 82209.4676 → 82209.47 is 0.000003 %, far inside the tolerance.
    expect(
      checkActionPrices(
        [{ action: "setStopLoss", value: "82209.47" }],
        context(),
      ).unverified,
    ).toEqual([]);
  });

  it("accepts the live price, the 24h high, a pivot and a bid", () => {
    expect(
      checkActionPrices(
        [
          { action: "setEntryPrice", value: "81859.7" },
          { action: "setStopLoss", value: "80627" },
          { action: "setTakeProfit", index: 0, value: "83142.4" },
          { action: "setTakeProfit", index: 1, value: "82278.6333" },
          { action: "setTakeProfit", index: 2, value: "81850.1" },
        ],
        context(),
      ).unverified,
    ).toEqual([]);
  });

  it("flags a plausible level the context never had", () => {
    // 81000 is within the 24h range; only the context decides.
    expect(
      checkActionPrices([{ action: "setEntryPrice", value: "81000" }], context())
        .unverified,
    ).toEqual([{ action: "setEntryPrice", value: "81000" }]);
  });

  it("flags a sub-cent price rounded to two decimals", () => {
    // 0.0123456 → 0.01 is a 19 % error; the shape check let it through.
    const subCent = context({
      REAL_TIME_PRICE: "0.0123456",
      marketDetails: { currentPrice: "0.0123456", high24h: "0.0131" },
      technicals: null,
    });
    expect(
      checkActionPrices(
        [{ action: "setEntryPrice", value: "0.01" }],
        subCent,
      ).unverified,
    ).toEqual([{ action: "setEntryPrice", value: "0.01" }]);
    expect(
      checkActionPrices(
        [{ action: "setEntryPrice", value: "0.0123456" }],
        subCent,
      ).unverified,
    ).toEqual([]);
  });

  it("does not let the 24h volume vouch for a price", () => {
    // Volume sits inside any band that is built from the price range.
    expect(
      checkActionPrices(
        [{ action: "setStopLoss", value: "21622.5" }],
        context(),
      ).unverified,
    ).toEqual([{ action: "setStopLoss", value: "21622.5" }]);
  });

  it("does not let an oscillator vouch for a $50 price", () => {
    const midPriced = context({
      REAL_TIME_PRICE: "50",
      marketDetails: { currentPrice: "50" },
      technicals: { oscillators: { RSI: "44.53" } },
    });
    expect(
      checkActionPrices(
        [{ action: "setStopLoss", value: "44.53" }],
        midPriced,
      ).unverified,
    ).toEqual([{ action: "setStopLoss", value: "44.53" }]);
  });

  it("does not let a take-profit percentage vouch for a price", () => {
    const withTargets = context({
      REAL_TIME_PRICE: "50",
      marketDetails: { currentPrice: "50" },
      technicals: null,
      tradeSetup: { entry: "50", tp: [{ price: "60", percent: "45" }] },
    });
    expect(
      checkActionPrices(
        [{ action: "setEntryPrice", value: "45" }],
        withTargets,
      ).unverified,
    ).toEqual([{ action: "setEntryPrice", value: "45" }]);
  });

  it("accepts a distant limit entry and an old position entry", () => {
    const distant = context({
      REAL_TIME_PRICE: "80000",
      marketDetails: { currentPrice: "80000" },
      technicals: null,
      tradeSetup: { entry: "10000", sl: "9000", tp: [{ price: "12000" }] },
      openPositions: [{ entry: "60000", size: "0.1" }],
    });
    expect(
      checkActionPrices(
        [
          { action: "setEntryPrice", value: "10000" },
          { action: "setStopLoss", value: "9000" },
          { action: "setTakeProfit", index: 0, value: "12000" },
          { action: "setTakeProfit", index: 1, value: "60000" },
        ],
        distant,
      ).unverified,
    ).toEqual([]);
  });

  it("flags an added take profit the context never had", () => {
    expect(
      checkActionPrices(
        [{ action: "addTakeProfit", value: "70000" }],
        context(),
      ).unverified,
    ).toEqual([{ action: "addTakeProfit", value: "70000" }]);
  });

  it("carries the take-profit index into the verdict", () => {
    // The warning renders `70000 (TP 2)`, so the row can be named.
    expect(
      checkActionPrices(
        [{ action: "setTakeProfit", index: 1, value: "70000" }],
        context(),
      ).unverified,
    ).toEqual([{ action: "setTakeProfit", index: 1, value: "70000" }]);
  });

  it("keeps the tolerance relative to the context level", () => {
    expect(PRICE_MATCH_TOLERANCE).toBe(0.001);
    const oneLevel = context({
      REAL_TIME_PRICE: "100000",
      marketDetails: { currentPrice: "100000" },
      technicals: null,
    });
    expect(
      checkActionPrices(
        [{ action: "setEntryPrice", value: "100050" }],
        oneLevel,
      ).unverified,
    ).toEqual([]);
    expect(
      checkActionPrices(
        [{ action: "setEntryPrice", value: "100200" }],
        oneLevel,
      ).unverified,
    ).toHaveLength(1);
  });

  it("pins the tolerance boundary itself", () => {
    // 0.1 % of 100000 is exactly 100, and the comparison is inclusive.
    const oneLevel = context({
      REAL_TIME_PRICE: "100000",
      marketDetails: { currentPrice: "100000" },
      technicals: null,
    });
    expect(
      checkActionPrices(
        [{ action: "setEntryPrice", value: "100100" }],
        oneLevel,
      ).unverified,
    ).toEqual([]);
    expect(
      checkActionPrices(
        [{ action: "setEntryPrice", value: "100101" }],
        oneLevel,
      ).unverified,
    ).toHaveLength(1);
  });

  it("parses the value the way execution does (k and m suffixes)", () => {
    // `executeAction` scales these; a check with a different parser would
    // verify 81859.7 and write 81859700.
    expect(
      checkActionPrices(
        [{ action: "setEntryPrice", value: "81859.7k" }],
        context(),
      ).unverified,
    ).toEqual([{ action: "setEntryPrice", value: "81859.7k" }]);
    expect(
      checkActionPrices(
        [{ action: "setStopLoss", value: "81859.7m" }],
        context(),
      ).unverified,
    ).toHaveLength(1);
    expect(
      checkActionPrices(
        [{ action: "setEntryPrice", value: "80K" }],
        context({
          REAL_TIME_PRICE: "80000",
          marketDetails: { currentPrice: "80000" },
          technicals: null,
        }),
      ).unverified,
    ).toEqual([]);
  });

  it("works without a live price, using only real levels", () => {
    // Reachable when technicals came from klines before the first ticker.
    const technicalsOnly = context({
      REAL_TIME_PRICE: "Unknown",
      marketDetails: null,
      tradeSetup: undefined,
      openPositions: undefined,
    });
    expect(
      checkActionPrices(
        [{ action: "setEntryPrice", value: "82209.47" }],
        technicalsOnly,
      ).unverified,
    ).toEqual([]);
    expect(
      checkActionPrices(
        [{ action: "setEntryPrice", value: "44.53" }],
        technicalsOnly,
      ).unverified,
    ).toEqual([{ action: "setEntryPrice", value: "44.53" }]);
  });

  it("reports a batch with a price but no context price as unchecked", () => {
    // A gather timeout: the model had no level to cite, so silence would
    // wrongly read as "verified".
    expect(
      checkActionPrices([{ action: "setEntryPrice", value: "12345" }], null),
    ).toEqual({ unverified: [], checked: false });
    expect(
      checkActionPrices([{ action: "setEntryPrice", value: "12345" }], {
        currentTime: "2026-10-19T00:00:00Z",
      } as PriceCheckContext),
    ).toEqual({ unverified: [], checked: false });
  });

  it("treats a batch without a price as checked", () => {
    expect(
      checkActionPrices(
        [
          { action: "setLeverage", value: "10" },
          { action: "setRisk", value: "2" },
          { action: "setTakeProfit", index: 0, percent: "50" },
          { action: "setNotes", value: "12345" },
        ],
        context(),
      ),
    ).toEqual({ unverified: [], checked: true });
  });

  it("keeps every price action in the catalog and behind confirmation", () => {
    // The guard is informational because a price batch always stops at the
    // confirmation block; adding a price action without that would break it.
    const catalogIds = new Set(AI_ACTION_CATALOG.map((entry) => entry.id));
    for (const action of AI_PRICE_ACTIONS) {
      expect(catalogIds.has(action)).toBe(true);
      expect(isKnownAiAction(action)).toBe(true);
      expect(requiresConfirmation(action)).toBe(true);
    }
  });
});
