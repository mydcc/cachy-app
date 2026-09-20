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

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { calculateBreakEvenPrice, calculateBaseMetrics, deriveMoneyMetrics } from "./core";
import { CONSTANTS } from "../constants";
import type { TradeValues } from "../../stores/types";

describe("calculateBreakEvenPrice", () => {
  it("sits above entry for a long, by roughly twice the fee rate", () => {
    const entryPrice = new Decimal(100);
    const feePercent = new Decimal("0.05"); // 0.05%
    const be = calculateBreakEvenPrice(entryPrice, feePercent, CONSTANTS.TRADE_TYPE_LONG);
    expect(be.gt(entryPrice)).toBe(true);
    expect(be.toNumber()).toBeCloseTo(100.1, 2);
  });

  it("sits below entry for a short, by roughly twice the fee rate", () => {
    const entryPrice = new Decimal(100);
    const feePercent = new Decimal("0.05");
    const be = calculateBreakEvenPrice(entryPrice, feePercent, CONSTANTS.TRADE_TYPE_SHORT);
    expect(be.lt(entryPrice)).toBe(true);
    expect(be.toNumber()).toBeCloseTo(99.9, 2);
  });

  it("returns the entry price unchanged when fees are zero", () => {
    const entryPrice = new Decimal(42000);
    const zero = new Decimal(0);
    expect(calculateBreakEvenPrice(entryPrice, zero, CONSTANTS.TRADE_TYPE_LONG).equals(entryPrice)).toBe(true);
    expect(calculateBreakEvenPrice(entryPrice, zero, CONSTANTS.TRADE_TYPE_SHORT).equals(entryPrice)).toBe(true);
  });

  it("matches calculateBaseMetrics' own breakEvenPrice for the same inputs", () => {
    const values: TradeValues = {
      accountSize: new Decimal(10000),
      riskPercentage: new Decimal(1),
      entryPrice: new Decimal(30000),
      stopLossPrice: new Decimal(29700),
      leverage: new Decimal(10),
      fees: new Decimal(CONSTANTS.DEFAULT_FEES),
    } as TradeValues;

    const base = calculateBaseMetrics(values, CONSTANTS.TRADE_TYPE_LONG);
    const standalone = calculateBreakEvenPrice(values.entryPrice, values.fees, CONSTANTS.TRADE_TYPE_LONG);

    expect(base).not.toBeNull();
    expect(base!.breakEvenPrice.equals(standalone)).toBe(true);
  });
});

describe("deriveMoneyMetrics — BUG-0252 (position size rounded after the initial calculation)", () => {
  const values: TradeValues = {
    accountSize: new Decimal(10000),
    riskPercentage: new Decimal(1),
    entryPrice: new Decimal(30000),
    stopLossPrice: new Decimal(29700),
    leverage: new Decimal(10),
    fees: new Decimal(CONSTANTS.DEFAULT_FEES),
  } as TradeValues;

  it("matches calculateBaseMetrics' own money fields for the same, unrounded position size", () => {
    const base = calculateBaseMetrics(values, CONSTANTS.TRADE_TYPE_LONG);
    expect(base).not.toBeNull();

    const derived = deriveMoneyMetrics(base!.positionSize, values, base!.riskAmount);
    expect(derived.requiredMargin.equals(base!.requiredMargin)).toBe(true);
    expect(derived.netLoss.equals(base!.netLoss)).toBe(true);
    expect(derived.entryFee.equals(base!.entryFee)).toBe(true);
  });

  it("scales requiredMargin/netLoss/entryFee down when re-derived from a rounded-down position size", () => {
    const base = calculateBaseMetrics(values, CONSTANTS.TRADE_TYPE_LONG);
    expect(base).not.toBeNull();

    // Exchange precision rounds the raw size down — exactly what the
    // calculator UI does before placing the order.
    const rounded = base!.positionSize.toDecimalPlaces(2, Decimal.ROUND_DOWN);
    expect(rounded.lt(base!.positionSize)).toBe(true);

    const derived = deriveMoneyMetrics(rounded, values, base!.riskAmount);
    expect(derived.requiredMargin.lt(base!.requiredMargin)).toBe(true);
    expect(derived.netLoss.lt(base!.netLoss)).toBe(true);
    expect(derived.entryFee.lt(base!.entryFee)).toBe(true);
  });
});
