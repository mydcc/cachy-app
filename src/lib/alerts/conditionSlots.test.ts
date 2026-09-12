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

/**
 * BUG-0443 — slot ownership.
 *
 * The conditions below are written out longhand rather than built through the
 * builders' own helpers on purpose: this module's whole job is to recognise
 * shapes, so a test that generated them through the same code under test would
 * agree with it by construction.
 */

import { describe, expect, it } from "vitest";

import { conditionInSlot, conditionMembers, slotOf } from "./conditionSlots";
import type { Condition } from "../rules/types";

const PRICE_CROSS: Condition = {
  kind: "cross",
  left: { kind: "price", field: "close" },
  direction: "above",
  right: { kind: "constant", value: "60000" },
  timeframe: "1h",
};

const PRICE_PERCENT: Condition = {
  kind: "compare",
  left: { kind: "percent_change", field: "close", lookback: 3 },
  op: "gte",
  right: { kind: "constant", value: "5" },
  timeframe: "4h",
};

const INDICATOR_VS_CONSTANT: Condition = {
  kind: "compare",
  left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
  op: "gt",
  right: { kind: "constant", value: "70" },
  timeframe: "1h",
};

const INDICATOR_VS_INDICATOR: Condition = {
  kind: "cross",
  left: { kind: "indicator", indicator: { id: "ema", params: { period: 9 } } },
  direction: "above",
  right: { kind: "indicator", indicator: { id: "ema", params: { period: 21 } } },
  timeframe: "1h",
};

const PATTERN: Condition = { kind: "pattern", pattern: "hammer", timeframe: "4h" };

function group(...of: Condition[]): Condition {
  return { kind: "group", op: "all", of };
}

describe("slotOf", () => {
  it("claims the shapes each builder actually emits", () => {
    expect(slotOf(PRICE_CROSS)).toBe("price");
    expect(slotOf(PRICE_PERCENT)).toBe("price");
    expect(slotOf(INDICATOR_VS_CONSTANT)).toBe("indicators");
    expect(slotOf(INDICATOR_VS_INDICATOR)).toBe("indicators");
    expect(slotOf(PATTERN)).toBe("candlesticks");
  });

  it("leaves a price subject against a non-constant unclaimed", () => {
    // The price builder compares its subject against a typed number and has no
    // form for anything else. Claiming this would mean hydrating blank from it
    // and then deleting it — the BUG-0443 failure, one shape further out.
    expect(
      slotOf({
        kind: "compare",
        left: { kind: "price", field: "close" },
        op: "gt",
        right: { kind: "indicator", indicator: { id: "ema", params: { period: 9 } } },
        timeframe: "1h",
      }),
    ).toBeNull();
  });

  it("leaves shapes no builder can round-trip unclaimed", () => {
    // Unknown means keep: an unclaimed condition is one no builder will replace
    // or remove, so it survives a tab switch instead of being deleted by
    // whichever builder came closest to owning it.
    const unclaimed: Condition[] = [
      {
        kind: "compare",
        left: { kind: "volume" },
        op: "gt",
        right: { kind: "constant", value: "1000" },
        timeframe: "1h",
      },
      {
        kind: "compare",
        left: { kind: "window", of: { kind: "price", field: "high" }, agg: "max", lookback: 20 },
        op: "gte",
        right: { kind: "constant", value: "1" },
        timeframe: "1h",
      },
      { kind: "position", side: "long", open: true },
      { kind: "account", field: "equity", op: "lt", value: "100" },
      { kind: "external_feed", feed: "sentiment", op: "gt", value: "0" },
      group(PRICE_CROSS),
    ];
    for (const condition of unclaimed) {
      expect(slotOf(condition), JSON.stringify(condition)).toBeNull();
    }
  });
});

describe("slotOf — known gap (BUG-0444)", () => {
  // slotOf() checks operand *kinds*, not the operator constraints each reader
  // imposes on top of them. These three shapes are claimed today even though
  // no reader can round-trip them, which reproduces the BUG-0443 failure one
  // step further out: the claiming builder hydrates blank and its mount-time
  // write then deletes the member. BUG-0444 tracks tightening slotOf() to
  // match reader constraints; when it lands, these three assertions flip from
  // the claimed slot to null.
  it("claims an indicator condition with a window RHS indicatorConditionForm rejects", () => {
    expect(
      slotOf({
        kind: "compare",
        left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
        op: "gt",
        right: { kind: "window", of: { kind: "price", field: "high" }, agg: "max", lookback: 20 },
        timeframe: "1h",
      }),
    ).toBe("indicators");
  });

  it("claims an indicator condition with a mark-source price RHS referenceFor rejects", () => {
    expect(
      slotOf({
        kind: "compare",
        left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
        op: "gt",
        right: { kind: "price", field: "close", source: "mark" },
        timeframe: "1h",
      }),
    ).toBe("indicators");
  });

  it("claims a percent_change comparison with an operator readPriceForm cannot render", () => {
    // readPriceForm only round-trips gte/lte; slotOf checks only the operand
    // kinds, not the operator.
    expect(
      slotOf({
        kind: "compare",
        left: { kind: "percent_change", field: "close", lookback: 3 },
        op: "gt",
        right: { kind: "constant", value: "5" },
        timeframe: "4h",
      }),
    ).toBe("price");
  });
});

describe("conditionMembers", () => {
  it("unwraps a group and wraps a bare condition", () => {
    expect(conditionMembers(group(PRICE_CROSS, PATTERN))).toEqual([PRICE_CROSS, PATTERN]);
    expect(conditionMembers(PRICE_CROSS)).toEqual([PRICE_CROSS]);
    expect(conditionMembers(null)).toEqual([]);
    expect(conditionMembers(undefined)).toEqual([]);
  });
});

describe("conditionInSlot", () => {
  it("returns this builder's own leg out of a mixed draft", () => {
    // The BUG-0443 fix: a draft holding somebody else's condition must not make
    // this builder read blank and overwrite it.
    const draft = group(PRICE_CROSS, INDICATOR_VS_CONSTANT, PATTERN);
    expect(conditionInSlot(draft, "price")).toEqual(PRICE_CROSS);
    expect(conditionInSlot(draft, "indicators")).toEqual(INDICATOR_VS_CONSTANT);
    expect(conditionInSlot(draft, "candlesticks")).toEqual(PATTERN);
  });

  it("returns null when this builder has authored nothing", () => {
    expect(conditionInSlot(group(PATTERN), "price")).toBeNull();
    expect(conditionInSlot(group(), "indicators")).toBeNull();
  });

  it("returns null for an ambiguous slot rather than its first leg", () => {
    // Two price legs are a combo (FEAT-0030) that a single-condition builder
    // cannot represent. Showing the first as "the" rule would misdescribe what
    // is armed — the guard that predates the slot model and outlives it.
    expect(conditionInSlot(group(PRICE_CROSS, PRICE_PERCENT), "price")).toBeNull();
    expect(conditionInSlot(group(PATTERN, PATTERN), "candlesticks")).toBeNull();
  });

  it("unwraps a bare seeded condition", () => {
    // An entry point outside the panel may seed the document directly.
    expect(conditionInSlot(PRICE_CROSS, "price")).toEqual(PRICE_CROSS);
  });
});
