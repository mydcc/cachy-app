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

  it("leaves an indicator the panel does not offer unclaimed, so a saved alert survives", () => {
    // BUG-0451 hides fourteen registry ids from the panel, and
    // `readIndicatorForm` cannot hydrate one. Claiming it would make the tab
    // hydrate blank and its mount-time write delete an alert that was saved
    // while the indicator was still offered.
    // `vwap` is outside the registry altogether; since FEAT-0446 group 4 every
    // registry indicator is offered.
    const hidden: Condition = {
      kind: "compare",
      left: { kind: "indicator", indicator: { id: "vwap", params: {} } },
      op: "gt",
      right: { kind: "constant", value: "1000" },
      timeframe: "1h",
    };
    expect(slotOf(hidden)).toBeNull();
    expect(conditionInSlot(group(hidden), "indicators")).toBeNull();
  });

  it("leaves unclaimed what the builder offers but cannot hydrate", () => {
    const rsi = { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } } as const;
    const obv = { kind: "indicator", indicator: { id: "obv", params: {} } } as const;
    const cannotHydrate = [
      // A window over another operand: the builder's windows are over the subject.
      {
        kind: "compare",
        left: rsi,
        op: "gte",
        right: { kind: "window", of: { kind: "price", field: "close" }, agg: "max", lookback: 20 },
        timeframe: "1h",
      },
      // OBV against a number, saved before the core refused it (FEAT-0446
      // group 4): the builder cannot offer it, so claiming it would rewrite it.
      { kind: "compare", left: obv, op: "gt", right: { kind: "constant", value: "1000" }, timeframe: "1h" },
    ] as unknown as Condition[];
    for (const condition of cannotHydrate) {
      expect(slotOf(condition), JSON.stringify(condition)).toBeNull();
    }

    const obvAtItsHigh = {
      kind: "compare",
      left: obv,
      op: "gte",
      right: { kind: "window", of: obv, agg: "max", lookback: 20 },
      timeframe: "1h",
    } as unknown as Condition;
    expect(slotOf(obvAtItsHigh)).toBe("indicators");
  });

  it("still claims an indicator the panel offers", () => {
    // The boundary of the check above: the same shape with an offered id stays
    // the indicators builder's to hydrate and write.
    expect(slotOf(INDICATOR_VS_CONSTANT)).toBe("indicators");
    expect(slotOf(INDICATOR_VS_INDICATOR)).toBe("indicators");
  });
});

describe("slotOf — known gap (BUG-0444)", () => {
  // slotOf() checked operand *kinds*, not the constraints each reader imposes
  // on top of them, so shapes no reader can round-trip were claimed: the
  // claiming builder hydrated blank and its mount-time write deleted the member
  // (BUG-0443 one step further out).
  //
  // Both halves are closed. The indicators half with FEAT-0446 group 4: slotOf
  // asks the reader's own parser, `indicatorFormOf`. The price half: slotOf asks
  // `priceReadingOf`, which claims a condition only when the price builder
  // rebuilds exactly that condition from the form it reads.
  it("leaves unclaimed an indicator condition with a window RHS over another operand", () => {
    expect(
      slotOf({
        kind: "compare",
        left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
        op: "gt",
        right: { kind: "window", of: { kind: "price", field: "high" }, agg: "max", lookback: 20 },
        timeframe: "1h",
      }),
    ).toBeNull();
  });

  // FEAT-0454: the core computes an indicator over the price its reference
  // names, and the tab reads and writes that price back, so it claims the
  // condition. Only a price the tab cannot show stays unclaimed: one on an
  // indicator that takes none, or a value no selector offers.
  it("claims an indicator condition that names the price it is computed over", () => {
    const rsiOverHl2 = { id: "rsi", params: { period: 14 }, field: "hl2" as const };
    expect(
      slotOf({
        kind: "compare",
        left: { kind: "indicator", indicator: rsiOverHl2 },
        op: "lt",
        right: { kind: "constant", value: "30" },
        timeframe: "1h",
      }),
    ).toBe("indicators");
    expect(
      slotOf({
        kind: "cross",
        left: { kind: "indicator", indicator: { id: "rsi", params: { period: 21 } } },
        direction: "above",
        right: { kind: "indicator", indicator: rsiOverHl2 },
        timeframe: "1h",
      }),
    ).toBe("indicators");
    expect(
      slotOf({
        kind: "compare",
        left: { kind: "indicator", indicator: rsiOverHl2 },
        op: "gte",
        right: { kind: "window", of: { kind: "indicator", indicator: rsiOverHl2 }, agg: "max", lookback: 20 },
        timeframe: "1h",
      }),
    ).toBe("indicators");
  });

  it("leaves unclaimed a window over the same indicator computed over another price", () => {
    const rsi = { id: "rsi", params: { period: 14 } };
    expect(
      slotOf({
        kind: "compare",
        left: { kind: "indicator", indicator: rsi },
        op: "gte",
        right: {
          kind: "window",
          of: { kind: "indicator", indicator: { ...rsi, field: "hl2" as const } },
          agg: "max",
          lookback: 20,
        },
        timeframe: "1h",
      }),
    ).toBeNull();
    // The default spelled out is the same line as the default omitted.
    expect(
      slotOf({
        kind: "compare",
        left: { kind: "indicator", indicator: rsi },
        op: "gte",
        right: {
          kind: "window",
          of: { kind: "indicator", indicator: { ...rsi, field: "close" as const } },
          agg: "max",
          lookback: 20,
        },
        timeframe: "1h",
      }),
    ).toBe("indicators");
  });

  it("leaves unclaimed an indicator condition naming a price the tab cannot show", () => {
    const onWilliamsR = { id: "williams_r", params: { period: 14 }, field: "hl2" as const };
    const unknownPrice = { id: "rsi", params: { period: 14 }, field: "ohlc4" } as unknown as {
      id: string;
      params: Record<string, number>;
      field: "close";
    };
    for (const indicator of [onWilliamsR, unknownPrice]) {
      expect(
        slotOf({
          kind: "compare",
          left: { kind: "indicator", indicator },
          op: "gt",
          right: { kind: "constant", value: "0" },
          timeframe: "1h",
        }),
        indicator.id,
      ).toBeNull();
      expect(
        slotOf({
          kind: "compare",
          left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
          op: "gt",
          right: { kind: "window", of: { kind: "indicator", indicator }, agg: "max", lookback: 20 },
          timeframe: "1h",
        }),
        `window over ${indicator.id}`,
      ).toBeNull();
    }
  });

  it("leaves unclaimed an indicator condition with a mark-source price RHS", () => {
    expect(
      slotOf({
        kind: "compare",
        left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
        op: "gt",
        right: { kind: "price", field: "close", source: "mark" },
        timeframe: "1h",
      }),
    ).toBeNull();
  });

  it("leaves unclaimed a percent_change comparison with an operator readPriceForm cannot render", () => {
    expect(
      slotOf({
        kind: "compare",
        left: { kind: "percent_change", field: "close", lookback: 3 },
        op: "gt",
        right: { kind: "constant", value: "5" },
        timeframe: "4h",
      }),
    ).toBeNull();
  });

  it("leaves unclaimed every price shape the builder would rebuild differently or not at all", () => {
    // Each of these reads as a form, but writing that form back either changes
    // the rule (a sign flipped, `source: "last"` dropped) or writes nothing (a
    // zero level, a fractional lookback), which deletes the member.
    const cannotRebuild = [
      // A rise to -5 % would be rewritten as a rise to +5 %.
      { kind: "compare", left: { kind: "percent_change", field: "close", lookback: 3 }, op: "gte", right: { kind: "constant", value: "-5" }, timeframe: "1h" },
      // A fall to +5 % would be rewritten as a fall to -5 %.
      { kind: "compare", left: { kind: "percent_change", field: "close", lookback: 3 }, op: "lte", right: { kind: "constant", value: "5" }, timeframe: "1h" },
      // A zero-percent move: the builder refuses it.
      { kind: "compare", left: { kind: "percent_change", field: "close", lookback: 3 }, op: "gte", right: { kind: "constant", value: "0" }, timeframe: "1h" },
      // A fractional lookback: the builder refuses it.
      { kind: "compare", left: { kind: "percent_change", field: "close", lookback: 2.5 }, op: "gte", right: { kind: "constant", value: "5" }, timeframe: "1h" },
      // A crossing at zero: the builder refuses it.
      { kind: "cross", left: { kind: "price", field: "close" }, direction: "above", right: { kind: "constant", value: "0" }, timeframe: "1h" },
      // An unparseable level: the builder refuses it.
      { kind: "cross", left: { kind: "price", field: "close" }, direction: "above", right: { kind: "constant", value: "abc" }, timeframe: "1h" },
      // `source: "last"` spelled out: the builder omits it, so the hash would change.
      { kind: "cross", left: { kind: "price", field: "close", source: "last" }, direction: "above", right: { kind: "constant", value: "60000" }, timeframe: "1h" },
    ] as unknown as Condition[];
    for (const condition of cannotRebuild) {
      expect(slotOf(condition), JSON.stringify(condition)).toBeNull();
    }
  });

  it("still claims a price condition on another OHLC field or the mark series", () => {
    // The boundary of the check above: the builder writes these, so they stay
    // its to hydrate and edit.
    const claimed: Condition[] = [
      { kind: "cross", left: { kind: "price", field: "high", source: "mark" }, direction: "below", right: { kind: "constant", value: "58000.5" }, timeframe: "4h" },
      { kind: "compare", left: { kind: "percent_change", field: "low", source: "mark", lookback: 7 }, op: "lte", right: { kind: "constant", value: "-2.5" }, timeframe: "1h" },
      // Spelled with trailing zeros: the same number, so the same rule.
      { kind: "cross", left: { kind: "price", field: "close" }, direction: "above", right: { kind: "constant", value: "60000.00" }, timeframe: "1h" },
    ];
    for (const condition of claimed) {
      expect(slotOf(condition), JSON.stringify(condition)).toBe("price");
    }
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
