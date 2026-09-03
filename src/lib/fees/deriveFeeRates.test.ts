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
 * FEAT-0253 — the fee model's acceptance criteria that are provable in
 * isolation: the derivation from the broker's own fills, and the fact that
 * every hazard listed on the item has a pinned expected behaviour rather than
 * a hopeful one.
 */

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { deriveFeeRatesFromFills, type RawFill } from "./deriveFeeRates";
import { resolveFeeRate, entryRoleForOrderType } from "./feeProvenance";

/** A fill charged exactly `ratePercent` on a notional of `price × qty`. */
function fillAt(
  role: "MAKER" | "TAKER",
  ratePercent: string,
  price = "100",
  qty = "2",
): RawFill {
  const fee = new Decimal(price)
    .times(qty)
    .times(new Decimal(ratePercent).div(100));
  return { roleType: role, price, qty, fee: fee.toString() };
}

describe("deriveFeeRatesFromFills — the broker's own fills as the source of truth", () => {
  it("derives both maker and taker rates from the fills (AC 1)", () => {
    const rates = deriveFeeRatesFromFills([
      fillAt("MAKER", "0.02"),
      fillAt("MAKER", "0.02"),
      fillAt("TAKER", "0.06"),
      fillAt("TAKER", "0.06"),
    ]);

    expect(rates.maker?.rate.toString()).toBe("0.02");
    expect(rates.taker?.rate.toString()).toBe("0.06");
    expect(rates.maker?.sampleCount).toBe(2);
    expect(rates.taker?.sampleCount).toBe(2);
  });

  it("reports a PERCENTAGE, multiplying the fraction by 100 exactly once (BUG-0329)", () => {
    // 0.12 charged on a notional of 100 × 2 = 200 is a fraction of 0.0006,
    // which is 0.06 PERCENT — the same unit as CONSTANTS.DEFAULT_FEES. A
    // second multiplication would read 6%, a hundredfold overstatement; a
    // missing one would read 0.0006%, which understates risk.
    const rates = deriveFeeRatesFromFills([
      { roleType: "TAKER", price: "100", qty: "2", fee: "0.12" },
    ]);
    expect(rates.taker?.rate.toString()).toBe("0.06");
  });

  it("accepts numeric as well as string fields, and is case-insensitive on roleType", () => {
    const rates = deriveFeeRatesFromFills([
      { roleType: "taker", price: 100, qty: 2, fee: 0.12 },
      { roleType: " Maker ", price: "100", qty: "2", fee: "0.04" },
    ]);
    expect(rates.taker?.rate.toString()).toBe("0.06");
    expect(rates.maker?.rate.toString()).toBe("0.02");
  });
});

describe("deriveFeeRatesFromFills — hazards each have a pinned behaviour (AC 2)", () => {
  it("a fresh account with no fills yields no rate at all — never a zero", () => {
    // A zero would flow into the calculator as a fee-free trade and understate
    // the real cost of every position sized from it.
    for (const input of [[], null, undefined]) {
      const rates = deriveFeeRatesFromFills(input);
      expect(rates.maker).toBeUndefined();
      expect(rates.taker).toBeUndefined();
    }
  });

  it("a role that has never been filled stays absent while the other resolves", () => {
    const rates = deriveFeeRatesFromFills([fillAt("TAKER", "0.06")]);
    expect(rates.taker?.rate.toString()).toBe("0.06");
    expect(rates.maker).toBeUndefined();
  });

  it("keeps the sign of a negative fee — a maker rebate is a credit, not a charge", () => {
    const rates = deriveFeeRatesFromFills([
      { roleType: "MAKER", price: "100", qty: "2", fee: "-0.02" },
    ]);
    expect(rates.maker?.rate.toString()).toBe("-0.01");
    expect(rates.maker?.rate.isNegative()).toBe(true);
  });

  it("absorbs a single distorted fill instead of letting it drag the rate", () => {
    // A discount token or coupon can make one fill's implied rate absurd. The
    // median holds; a mean here would report 0.42 and mis-size every trade.
    const rates = deriveFeeRatesFromFills([
      fillAt("TAKER", "0.06"),
      fillAt("TAKER", "0.06"),
      fillAt("TAKER", "0.06"),
      fillAt("TAKER", "1.5"),
    ]);
    expect(rates.taker?.rate.toString()).toBe("0.06");
    expect(rates.taker?.sampleCount).toBe(4);
  });

  it("skips a zero-notional fill rather than dividing by zero", () => {
    const rates = deriveFeeRatesFromFills([
      { roleType: "TAKER", price: "0", qty: "2", fee: "0.12" },
      { roleType: "TAKER", price: "100", qty: "0", fee: "0.12" },
      fillAt("TAKER", "0.06"),
    ]);
    expect(rates.taker?.rate.toString()).toBe("0.06");
    expect(rates.taker?.sampleCount).toBe(1);
    expect(rates.skipped).toBe(2);
  });

  it("skips records with missing, unparseable or non-finite fields", () => {
    const rates = deriveFeeRatesFromFills([
      { roleType: "TAKER", price: "100", qty: "2" }, // no fee
      { roleType: "TAKER", price: "abc", qty: "2", fee: "0.12" },
      { roleType: "SETTLEMENT", price: "100", qty: "2", fee: "0.12" },
      { roleType: "TAKER", price: "100", qty: "2", fee: Number.NaN },
      null as unknown as RawFill,
      fillAt("TAKER", "0.06"),
    ]);
    expect(rates.taker?.sampleCount).toBe(1);
    expect(rates.skipped).toBe(5);
  });

  it("treats an empty-string fee as absent, not as zero", () => {
    const rates = deriveFeeRatesFromFills([
      { roleType: "MAKER", price: "100", qty: "2", fee: "" },
    ]);
    expect(rates.maker).toBeUndefined();
    expect(rates.skipped).toBe(1);
  });
});

describe("resolveFeeRate — provenance is never overstated (AC 7)", () => {
  const venueDefault = new Decimal("0.06");

  it("labels a rate derived from fills as coming from the broker", () => {
    const resolved = resolveFeeRate("taker", {
      derived: deriveFeeRatesFromFills([fillAt("TAKER", "0.045")]),
      settingsRate: new Decimal("0.06"),
      venueDefault,
      isPaperTrading: false,
    });
    expect(resolved.provenance).toBe("broker");
    expect(resolved.rate.toString()).toBe("0.045");
    expect(resolved.sampleCount).toBe(1);
  });

  it("falls back to the untouched venue default as 'assumed', not 'from broker'", () => {
    const resolved = resolveFeeRate("maker", {
      derived: deriveFeeRatesFromFills([fillAt("TAKER", "0.06")]),
      settingsRate: new Decimal("0.0200"),
      venueDefault: new Decimal("0.02"),
      isPaperTrading: false,
    });
    expect(resolved.provenance).toBe("assumed");
    expect(resolved.sampleCount).toBeUndefined();
  });

  it("calls a Settings value that differs from the venue default 'manual'", () => {
    const resolved = resolveFeeRate("taker", {
      settingsRate: new Decimal("0.035"),
      venueDefault,
      isPaperTrading: false,
    });
    expect(resolved.provenance).toBe("manual");
    expect(resolved.rate.toString()).toBe("0.035");
  });

  it("shows a Settings rate the way the user typed it, trailing zeros and all", () => {
    // "0.0600" and "0.06" are the same tariff, but a field that rewrites what
    // was typed reads as if the input had been rejected.
    const resolved = resolveFeeRate("taker", {
      settingsRate: new Decimal("0.0600"),
      settingsDisplay: "0.0600",
      venueDefault,
      isPaperTrading: false,
    });
    expect(resolved.display).toBe("0.0600");
    expect(resolved.provenance).toBe("assumed");
  });

  it("shows a broker-derived rate as the derivation produced it", () => {
    const resolved = resolveFeeRate("taker", {
      derived: deriveFeeRatesFromFills([fillAt("TAKER", "0.045")]),
      settingsRate: new Decimal("0.0600"),
      settingsDisplay: "0.0600",
      venueDefault,
      isPaperTrading: false,
    });
    expect(resolved.display).toBe("0.045");
  });

  it("never claims 'from broker' in paper trading, even with a derived rate present", () => {
    const resolved = resolveFeeRate("taker", {
      derived: deriveFeeRatesFromFills([fillAt("TAKER", "0.045")]),
      settingsRate: new Decimal("0.035"),
      venueDefault,
      isPaperTrading: true,
    });
    expect(resolved.provenance).toBe("manual");
    expect(resolved.rate.toString()).toBe("0.035");
  });
});

describe("entryRoleForOrderType — the entry leg follows the order type (AC 3)", () => {
  it("a market order is a taker fill", () => {
    expect(entryRoleForOrderType("market")).toBe("taker");
  });

  it("a limit order is a maker fill", () => {
    expect(entryRoleForOrderType("limit")).toBe("maker");
  });
});
