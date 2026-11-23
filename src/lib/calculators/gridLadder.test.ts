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
 * FEAT-0819 stage 2 — the grid ladder's arithmetic, case by case.
 *
 * Money-path tests: every expected value is a decimal string worked out by
 * hand in the comment beside it, never a float the code under test produced.
 */

import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  counterOrderOf,
  gridExposure,
  gridLines,
  gridSlots,
  gridWorstCase,
  minimumViableSpacing,
  narrowestSpacing,
  type GridRange,
} from "./gridLadder";

const d = (value: string | number) => new Decimal(value);
const strings = (values: Decimal[]) => values.map((v) => v.toString());

function range(overrides: Partial<GridRange> = {}): GridRange {
  return { lower: d("100"), upper: d("200"), levelCount: 5, spacing: "arithmetic", ...overrides };
}

function linesOf(overrides: Partial<GridRange> = {}, priceStep?: Decimal): Decimal[] {
  const result = gridLines(range(overrides), priceStep);
  if (!result.ok) throw new Error(`expected lines, got ${result.reason}`);
  return result.value;
}

describe("grid lines", () => {
  it("places arithmetic lines at equal amounts, both bounds included", () => {
    // 100 to 200 in four intervals of 25.
    expect(strings(linesOf())).toEqual(["100", "125", "150", "175", "200"]);
  });

  it("places geometric lines at an equal ratio and ends exactly on the upper bound", () => {
    // 100 to 400 in two intervals: ratio 2.
    expect(strings(linesOf({ upper: d("400"), levelCount: 3, spacing: "geometric" }))).toEqual([
      "100",
      "200",
      "400",
    ]);
    const lines = linesOf({ upper: d("150"), levelCount: 7, spacing: "geometric" });
    expect(lines).toHaveLength(7);
    expect(lines[6].toString()).toBe("150");
  });

  it("rounds each line to the price step", () => {
    // 100 to 101 in three intervals: 100, 100.333…, 100.666…, 101 → step 0.1.
    expect(strings(linesOf({ upper: d("101"), levelCount: 4 }, d("0.1")))).toEqual([
      "100",
      "100.3",
      "100.7",
      "101",
    ]);
  });

  it("refuses a ladder whose rounded lines collapse into one another", () => {
    // 100 to 101 in ten intervals of 0.1 cannot survive a step of 1.
    expect(gridLines(range({ upper: d("101"), levelCount: 11 }), d("1"))).toEqual({
      ok: false,
      reason: "levels-collapse",
    });
  });

  it("refuses an invalid range or level count", () => {
    expect(gridLines(range({ upper: d("100") }))).toEqual({ ok: false, reason: "invalid-range" });
    expect(gridLines(range({ lower: d("0") }))).toEqual({ ok: false, reason: "invalid-range" });
    expect(gridLines(range({ levelCount: 1 }))).toEqual({ ok: false, reason: "invalid-range" });
    expect(gridLines(range({ levelCount: 2.5 }))).toEqual({ ok: false, reason: "invalid-range" });
  });
});

describe("grid slots", () => {
  it("has one slot fewer than lines, so no counter-order leaves the range", () => {
    const lines = linesOf();
    const result = gridSlots("long", lines, d("1000"));
    if (!result.ok) throw new Error(result.reason);

    expect(result.value).toHaveLength(4);
    const top = result.value[3];
    expect(top.closePrice.toString()).toBe("200");
    for (const slot of result.value) {
      expect(slot.openPrice.gte(lines[0]) && slot.closePrice.lte(lines[4])).toBe(true);
    }
  });

  it("opens a long slot on its lower line and a short slot on its upper line", () => {
    const lines = linesOf();
    const long = gridSlots("long", lines, d("1000"));
    const short = gridSlots("short", lines, d("1000"));
    if (!long.ok || !short.ok) throw new Error("expected slots");

    expect(long.value[0].openPrice.toString()).toBe("100");
    expect(long.value[0].closePrice.toString()).toBe("125");
    expect(short.value[0].openPrice.toString()).toBe("125");
    expect(short.value[0].closePrice.toString()).toBe("100");
  });

  it("splits the budget evenly and rounds each quantity down to the step", () => {
    // 1000 over four slots is 250 each. At 100: 2.5; at 125: 2; at 150:
    // 1.666… → 1.66; at 175: 1.428… → 1.42 with a step of 0.01.
    const result = gridSlots("long", linesOf(), d("1000"), d("0.01"));
    if (!result.ok) throw new Error(result.reason);

    expect(strings(result.value.map((s) => s.quantity))).toEqual(["2.5", "2", "1.66", "1.42"]);
  });

  it("never spends more than the budget", () => {
    for (const [budget, step] of [
      ["1000", "0.01"],
      ["333.33", "0.001"],
      ["50", "0.1"],
      ["7", "0.0001"],
    ]) {
      const result = gridSlots("long", linesOf(), d(budget), d(step));
      if (!result.ok) continue;
      const spent = result.value.reduce((sum, s) => sum.plus(s.quantity.times(s.openPrice)), d(0));
      expect(spent.lte(d(budget)), `${budget} @ ${step}: spent ${spent}`).toBe(true);
    }
  });

  it("refuses a budget whose share buys less than one step, instead of thinning the ladder", () => {
    // 10 over four slots is 2.5 each; at 175 that is 0.0142…, below a step of 0.1.
    expect(gridSlots("long", linesOf(), d("10"), d("0.1"))).toEqual({
      ok: false,
      reason: "slot-below-step",
    });
  });
});

describe("counter-orders", () => {
  it("an opening fill makes the closing order due, and a closing fill the opening one", () => {
    const result = gridSlots("long", linesOf(), d("1000"));
    if (!result.ok) throw new Error(result.reason);
    const slot = result.value[1];

    expect(counterOrderOf(slot, "open")).toEqual({ leg: "close", price: slot.closePrice });
    expect(counterOrderOf(slot, "close")).toEqual({ leg: "open", price: slot.openPrice });
  });
});

describe("fees against spacing", () => {
  it("names the spacing at which a round trip only breaks even", () => {
    // f = 0.0006: 2f / (1 − f) = 0.0012 / 0.9994.
    expect(minimumViableSpacing(d("0.0006")).toString()).toBe(d("0.0012").div("0.9994").toString());
    expect(minimumViableSpacing(d("0")).toString()).toBe("0");
  });

  it("a cycle at exactly the minimum spacing earns zero after fees", () => {
    const f = d("0.0006");
    const buy = d("100");
    const sell = buy.times(minimumViableSpacing(f).plus(1));
    const pnl = sell.minus(buy).minus(buy.plus(sell).times(f));
    // Zero within decimal.js's 20 significant digits on a price of 100.
    expect(pnl.abs().lt(d("1e-15")), pnl.toString()).toBe(true);
  });

  it("finds the narrowest slot of a geometric ladder", () => {
    // Ratio 2 everywhere: every slot spans 100 %.
    expect(narrowestSpacing(linesOf({ upper: d("400"), levelCount: 3, spacing: "geometric" }))?.toString()).toBe("1");
    // Arithmetic: the top slot is relatively the narrowest, 200 / 175 − 1.
    expect(narrowestSpacing(linesOf())?.toString()).toBe(d(200).div(175).minus(1).toString());
  });
});

describe("budget and worst case", () => {
  function slots(side: "long" | "short") {
    // Two lines, one slot: 100 to 110, budget 1000 → 10 at 100 (long) or
    // 9.0909… → 9 at 110 (short) with a step of 1.
    const result = gridSlots(side, linesOf({ upper: d("110"), levelCount: 2 }), d("1000"), d("1"));
    if (!result.ok) throw new Error(result.reason);
    return result.value;
  }

  it("adds the fees of both legs to the notional", () => {
    // 10 × 100 = 1000 notional; fees 0.001 × (1000 + 10 × 110) = 2.1.
    const exposure = gridExposure(slots("long"), d("0.001"));
    expect(exposure.notional.toString()).toBe("1000");
    expect(exposure.budgetWithFees.toString()).toBe("1002.1");
  });

  it("prices a long's worst case with every opening filled and the stop-out executed", () => {
    // 10 bought at 100, closed at 90: 100 lost; fees 0.001 × 10 × (100 + 90) = 1.9.
    const worst = gridWorstCase("long", slots("long"), d("90"), d("0.001"), d("10000"));
    expect(worst.loss.toString()).toBe("101.9");
    expect(worst.shareOfAccount?.toString()).toBe("0.01019");
  });

  it("mirrors the worst case for a short", () => {
    // 9 sold at 110, closed at 120: 90 lost; fees 0.001 × 9 × (110 + 120) = 2.07.
    const worst = gridWorstCase("short", slots("short"), d("120"), d("0.001"), d("10000"));
    expect(worst.loss.toString()).toBe("92.07");
  });

  it("answers no share for an account it cannot divide by", () => {
    expect(gridWorstCase("long", slots("long"), d("90"), d("0.001"), d("0")).shareOfAccount).toBeNull();
  });
});
