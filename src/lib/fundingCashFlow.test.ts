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

/*
 * BUG-0559 — the estimated 24h funding cash flow carries the planned
 * trade direction: positive is a cost, negative is income, and a short
 * mirrors the long. Funding-rate convention: a positive rate means
 * longs pay shorts. An unusable settlement interval has no cash flow at
 * all, so the function reports that with `null` instead of dividing by
 * zero into an infinite display value.
 */

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { signedFundingCashFlow24h } from "./fundingCashFlow";

const NOTIONAL = new Decimal(10000);
const POSITIVE_RATE = new Decimal("0.0001");
const NEGATIVE_RATE = new Decimal("-0.0001");

describe("BUG-0559 — funding cash flow carries the position side", () => {
  it("charges a long the positive rate as a cost", () => {
    // 10000 x 0.0001 x 3 settlements = 3 USDT cost.
    expect(signedFundingCashFlow24h(NOTIONAL, POSITIVE_RATE, 8, "long")?.toString()).toBe("3");
  });

  it("pays a short the positive rate as income", () => {
    expect(signedFundingCashFlow24h(NOTIONAL, POSITIVE_RATE, 8, "short")?.toString()).toBe("-3");
  });

  it("pays a long the negative rate as income", () => {
    expect(signedFundingCashFlow24h(NOTIONAL, NEGATIVE_RATE, 8, "long")?.toString()).toBe("-3");
  });

  it("charges a short the negative rate as a cost", () => {
    expect(signedFundingCashFlow24h(NOTIONAL, NEGATIVE_RATE, 8, "short")?.toString()).toBe("3");
  });

  it("stays exact for non-eight-hour intervals", () => {
    // 4h interval: 6 settlements; 1h interval: 24 settlements.
    expect(signedFundingCashFlow24h(NOTIONAL, POSITIVE_RATE, 4, "long")?.toString()).toBe("6");
    expect(signedFundingCashFlow24h(NOTIONAL, POSITIVE_RATE, 1, "short")?.toString()).toBe("-24");
  });

  it("returns zero for a zero rate on either side", () => {
    expect(signedFundingCashFlow24h(NOTIONAL, new Decimal(0), 8, "long")?.isZero()).toBe(true);
    expect(signedFundingCashFlow24h(NOTIONAL, new Decimal(0), 8, "short")?.isZero()).toBe(true);
  });
});

describe("BUG-0559 — an unusable settlement interval has no estimate", () => {
  it("returns null for a zero interval instead of Infinity", () => {
    // 24 / 0 would be Infinity, which the UI would render as "+Infinity USDT".
    expect(signedFundingCashFlow24h(NOTIONAL, POSITIVE_RATE, 0, "long")).toBeNull();
    expect(signedFundingCashFlow24h(NOTIONAL, POSITIVE_RATE, 0, "short")).toBeNull();
  });

  it("returns null for a negative interval", () => {
    expect(signedFundingCashFlow24h(NOTIONAL, POSITIVE_RATE, -8, "long")).toBeNull();
    expect(signedFundingCashFlow24h(NOTIONAL, POSITIVE_RATE, -8, "short")).toBeNull();
  });

  it("returns null for a non-finite interval", () => {
    expect(signedFundingCashFlow24h(NOTIONAL, POSITIVE_RATE, Number.NaN, "long")).toBeNull();
    expect(signedFundingCashFlow24h(NOTIONAL, POSITIVE_RATE, Number.POSITIVE_INFINITY, "short")).toBeNull();
  });
});
