// @vitest-environment node
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

/*
 * The default fee rate is the taker-leg fallback.
 *
 * `CONSTANTS.DEFAULT_FEES` is the rate every fee figure falls back to: the
 * initial value of `tradeState.fees`, the fallback in `calculatorService`
 * when the field is empty, and — the part that reaches real money — the rate
 * `accountState` hydrates open positions with, from both the WebSocket and
 * REST.
 *
 * It is the taker rate on purpose: the exit leg is unknowable while the plan
 * is made and is therefore assumed taker, and the per-leg maker/taker split
 * (FEAT-0253) means the maker rate never stands in for both legs.
 *
 * These tests hold the floor, the unit, and the blast radius.
 */

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { calculateBaseMetrics } from "./core";
import { CONSTANTS } from "../constants";
import type { TradeValues } from "../../stores/types";

/*
 * Theoretical taker default. The taker leg is the floor because the exit leg
 * is assumed taker (FEAT-0253).
 */
const DOCUMENTED_TAKER_PERCENT = new Decimal("0.042");

function valuesWithFee(fee: Decimal): TradeValues {
  return {
    accountSize: new Decimal(10000),
    riskPercentage: new Decimal(1),
    entryPrice: new Decimal(30000),
    stopLossPrice: new Decimal(29700),
    leverage: new Decimal(10),
    fees: fee,
  } as TradeValues;
}

describe("default fee rate is the taker-leg fallback", () => {
  it("is at least the theoretical taker rate", () => {
    // Guards against a maker rate standing in for both legs.
    const actual = new Decimal(CONSTANTS.DEFAULT_FEES);
    expect(actual.gte(DOCUMENTED_TAKER_PERCENT)).toBe(true);
  });

  it("is a percentage number, not a fraction", () => {
    /*
     * The single most expensive way to "fix" this constant is to read "0.06%"
     * and write `0.0006`. The division by 100 happens inside
     * `calculateBreakEvenPrice`, so a pre-divided value makes every fee 100x
     * too small — a far worse version of the bug being fixed here.
     *
     * A plausible percentage fee lives between 0.001% and 1%. A fraction of
     * the same rate (0.0006) falls below that floor; a rate mistaken for
     * whole percent (6) rises above the ceiling.
     */
    const actual = new Decimal(CONSTANTS.DEFAULT_FEES);
    expect(actual.gte("0.001")).toBe(true);
    expect(actual.lte("1")).toBe(true);
  });

  it("moves break-even by roughly twice the rate, confirming the unit end to end", () => {
    // Entry 30000 at 0.06% per leg -> break-even ~0.12% above entry. Had the
    // constant been stored as a fraction this would be ~0.0012% and the
    // assertion would not survive it.
    const base = calculateBaseMetrics(
      valuesWithFee(new Decimal(CONSTANTS.DEFAULT_FEES)),
      CONSTANTS.TRADE_TYPE_LONG,
    );
    expect(base).not.toBeNull();

    const driftPercent = base!.breakEvenPrice.minus(30000).div(30000).times(100);
    const expected = new Decimal(CONSTANTS.DEFAULT_FEES).times(2);

    expect(driftPercent.minus(expected).abs().lt("0.01")).toBe(true);
  });
});

describe("BUG-0329 — raising the rate moves the cost figures, never the size", () => {
  /*
   * The fix must not become a sizing change by accident. Position size comes
   * from `riskAmount / riskPerUnit`, which fees do not enter — so a higher
   * rate has to leave it untouched while the fee-derived figures move.
   */
  const cheap = calculateBaseMetrics(
    valuesWithFee(new Decimal("0.0140")),
    CONSTANTS.TRADE_TYPE_LONG,
  );
  const dear = calculateBaseMetrics(
    valuesWithFee(DOCUMENTED_TAKER_PERCENT),
    CONSTANTS.TRADE_TYPE_LONG,
  );

  it("leaves the position size identical", () => {
    expect(cheap).not.toBeNull();
    expect(dear).not.toBeNull();
    expect(dear!.positionSize.equals(cheap!.positionSize)).toBe(true);
  });

  it("raises the entry fee", () => {
    expect(dear!.entryFee.gt(cheap!.entryFee)).toBe(true);
  });

  it("pushes break-even further from entry", () => {
    expect(dear!.breakEvenPrice.gt(cheap!.breakEvenPrice)).toBe(true);
  });

  it("leaves the liquidation price alone — it is a leverage property, not a fee one", () => {
    expect(dear!.liquidationPrice.equals(cheap!.liquidationPrice)).toBe(true);
  });
});
