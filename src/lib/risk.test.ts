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

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import {
  effectiveRiskAmount,
  effectiveRiskPercentage,
  type RiskSource,
} from "./risk";

const base: RiskSource = {
  accountSize: "10000",
  riskPercentage: "1",
  riskAmount: "100",
  isRiskAmountLocked: false,
  isPositionSizeLocked: false,
  lockedPositionSize: null,
  entryPrice: "50000",
  stopLossPrice: "49500",
};

describe("risk lens", () => {
  it("derives the amount from account and percentage when unlocked", () => {
    expect(effectiveRiskAmount(base).eq(new Decimal("100"))).toBe(true);
    expect(effectiveRiskPercentage(base).eq(new Decimal("1"))).toBe(true);
  });

  it("reads the stored amount and derives the percentage when amount-locked", () => {
    const locked = { ...base, isRiskAmountLocked: true, riskAmount: "250" };
    expect(effectiveRiskAmount(locked).eq(new Decimal("250"))).toBe(true);
    expect(effectiveRiskPercentage(locked).eq(new Decimal("2.5"))).toBe(true);
  });

  it("falls back to the stored percentage when the locked amount is not positive", () => {
    const locked = {
      ...base,
      isRiskAmountLocked: true,
      riskAmount: "0",
      riskPercentage: "3",
    };
    // Same fallback the calculator uses: an empty amount cannot size
    // anything, so the stored percentage stays the input.
    expect(effectiveRiskPercentage(locked).eq(new Decimal("3"))).toBe(true);
  });

  it("derives both sides from the locked size and the stop distance", () => {
    const locked = {
      ...base,
      isPositionSizeLocked: true,
      lockedPositionSize: new Decimal("0.2"),
    };
    // |50000 - 49500| * 0.2 = 100 risk amount, 1% of 10000.
    expect(effectiveRiskAmount(locked).eq(new Decimal("100"))).toBe(true);
    expect(effectiveRiskPercentage(locked).eq(new Decimal("1"))).toBe(true);
  });

  it("reports zero percent for a locked size against an empty account", () => {
    const locked = {
      ...base,
      isPositionSizeLocked: true,
      lockedPositionSize: new Decimal("0.2"),
      accountSize: "0",
    };
    expect(effectiveRiskPercentage(locked).isZero()).toBe(true);
    // The amount itself does not need the account.
    expect(effectiveRiskAmount(locked).eq(new Decimal("100"))).toBe(true);
  });

  it("falls back to the default formula without a locked size", () => {
    const locked = { ...base, isPositionSizeLocked: true };
    expect(effectiveRiskAmount(locked).eq(new Decimal("100"))).toBe(true);
    expect(effectiveRiskPercentage(locked).eq(new Decimal("1"))).toBe(true);
  });

  it("never throws on garbage input", () => {
    const garbage: RiskSource = {
      accountSize: "abc",
      riskPercentage: "",
      riskAmount: null,
      isRiskAmountLocked: true,
      isPositionSizeLocked: false,
      lockedPositionSize: null,
      entryPrice: undefined,
      stopLossPrice: undefined,
    };
    expect(() => effectiveRiskAmount(garbage)).not.toThrow();
    expect(() => effectiveRiskPercentage(garbage)).not.toThrow();
  });
});
