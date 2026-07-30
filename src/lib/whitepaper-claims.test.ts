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
import { calculator } from "./calculator";
import { CONSTANTS } from "./constants";

/**
 * Executable check of the worked example published in the technical whitepaper
 * (`src/lib/assets/content/whitepaper.{de,en}.md`, chapter 3, "The Risk Engine:
 * A Concrete Example").
 *
 * The whitepaper is shown to outside readers and states specific numbers. This
 * test runs those exact inputs through the real calculator, so the document
 * cannot drift away from the engine it describes without a test failing.
 *
 * If you change this test, change the whitepaper to match — or the other way
 * round. They are one claim, expressed twice.
 */
describe("Whitepaper chapter 3 — published risk engine example", () => {
  // Account Size $10,000 · Risk 1% ($100) · Entry $50,000 · Stop Loss $49,000
  const values = {
    accountSize: new Decimal(10000),
    riskPercentage: new Decimal(1),
    entryPrice: new Decimal(50000),
    stopLossPrice: new Decimal(49000),
    leverage: new Decimal(10),
    fees: new Decimal(0),
    symbol: "BTCUSDT",
    useAtrSl: false,
    atrValue: new Decimal(0),
    atrMultiplier: new Decimal(0),
    targets: [],
    totalPercentSold: new Decimal(0),
  };

  const result = calculator.calculateBaseMetrics(
    values as never,
    CONSTANTS.TRADE_TYPE_LONG,
  );

  it("produces a result for the documented inputs", () => {
    expect(result).not.toBeNull();
  });

  it("risks exactly 1% of the account, i.e. $100", () => {
    // Step 1 of the whitepaper: risk = 10,000 * 1% = 100
    expect(result!.riskAmount.toNumber()).toBe(100);
  });

  it("derives a position size of 0.1 BTC from a $1,000 stop distance", () => {
    // Steps 1-2: delta = |50,000 - 49,000| = 1,000; qty = 100 / 1,000 = 0.1
    expect(result!.positionSize.toNumber()).toBe(0.1);
  });

  it("values the position at $5,000", () => {
    // Step 4: 0.1 * 50,000. Position value is derived rather than stored —
    // BaseMetrics exposes positionSize and requiredMargin, not order volume.
    const positionValue = result!.positionSize.times(values.entryPrice);
    expect(positionValue.toNumber()).toBe(5000);
  });

  it("requires $500 margin at 10x leverage", () => {
    // Step 4: 5,000 / 10
    expect(result!.requiredMargin.toNumber()).toBe(500);
  });

  it("loses exactly the risked $100 if the stop is hit", () => {
    // Step 3, the validation the whitepaper calls "the math holds":
    // position size * stop distance must equal the risk amount.
    const lossAtStop = result!.positionSize.times(
      values.entryPrice.minus(values.stopLossPrice).abs(),
    );
    expect(lossAtStop.toNumber()).toBe(100);
    expect(lossAtStop.equals(result!.riskAmount)).toBe(true);
  });
});
