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
 * FEAT-0253 — the entry and exit legs are charged their own rates.
 *
 * These are the assertions that protect money: an entry fee that ignores the
 * order type overstates the cost of a limit entry, and an exit fee taken at
 * the maker rate understates the cost of a stop-out. The second error is the
 * dangerous one, which is why the conservative direction is pinned here too.
 */

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { CONSTANTS } from "../constants";
import {
  deriveMoneyMetrics,
  calculateBreakEvenPrice,
  calculateBaseMetrics,
  calculateIndividualTp,
  calculateTotalMetrics,
} from "./core";
import type { TradeValues } from "../../stores/types";

const MAKER = new Decimal("0.02");
const TAKER = new Decimal("0.06");

/** entry 100, stop 90 — a 10-per-unit risk, so 2 units risk 20. */
function moneyInputs(overrides: Partial<TradeValues> = {}) {
  return {
    entryPrice: new Decimal(100),
    stopLossPrice: new Decimal(90),
    leverage: new Decimal(10),
    fees: TAKER,
    ...overrides,
  };
}

function tradeValues(overrides: Partial<TradeValues> = {}): TradeValues {
  return {
    accountSize: new Decimal(1000),
    riskPercentage: new Decimal(2),
    entryPrice: new Decimal(100),
    stopLossPrice: new Decimal(90),
    leverage: new Decimal(10),
    fees: TAKER,
    symbol: "BTCUSDT",
    useAtrSl: false,
    atrValue: new Decimal(0),
    atrMultiplier: new Decimal(0),
    targets: [],
    totalPercentSold: new Decimal(0),
    ...overrides,
  };
}

describe("deriveMoneyMetrics — each leg pays its own rate (AC 3, AC 4)", () => {
  it("charges the entry at entryFees and the stop-out at exitFees", () => {
    const { entryFee, netLoss, requiredMargin } = deriveMoneyMetrics(
      new Decimal(2),
      moneyInputs({ entryFees: MAKER, exitFees: TAKER }),
      new Decimal(20),
    );

    // 200 notional × 0.02% = 0.04 in, 180 × 0.06% = 0.108 out.
    expect(entryFee.toString()).toBe("0.04");
    expect(netLoss.toString()).toBe("20.148");
    expect(requiredMargin.toString()).toBe("20");
  });

  it("falls back to the flat rate for both legs when neither is given", () => {
    // The behaviour every caller had before the split, unchanged.
    const { entryFee, netLoss } = deriveMoneyMetrics(
      new Decimal(2),
      moneyInputs(),
      new Decimal(20),
    );
    expect(entryFee.toString()).toBe("0.12");
    expect(netLoss.toString()).toBe("20.228");
  });

  it("falls back per leg — an entry rate alone leaves the exit on the flat rate", () => {
    const { entryFee, netLoss } = deriveMoneyMetrics(
      new Decimal(2),
      moneyInputs({ entryFees: MAKER }),
      new Decimal(20),
    );
    expect(entryFee.toString()).toBe("0.04");
    // Exit still at the flat 0.06%: 180 × 0.0006 = 0.108.
    expect(netLoss.toString()).toBe("20.148");
  });

  it("a taker exit assumption costs more than a maker one — the safe direction", () => {
    const taker = deriveMoneyMetrics(
      new Decimal(2),
      moneyInputs({ entryFees: TAKER, exitFees: TAKER }),
      new Decimal(20),
    );
    const maker = deriveMoneyMetrics(
      new Decimal(2),
      moneyInputs({ entryFees: TAKER, exitFees: MAKER }),
      new Decimal(20),
    );
    expect(taker.netLoss.gt(maker.netLoss)).toBe(true);
  });
});

describe("calculateBreakEvenPrice — two legs, two rates", () => {
  it("is unchanged when the exit rate is omitted", () => {
    const entry = new Decimal(100);
    for (const type of [CONSTANTS.TRADE_TYPE_LONG, CONSTANTS.TRADE_TYPE_SHORT]) {
      const implicit = calculateBreakEvenPrice(entry, TAKER, type);
      const explicit = calculateBreakEvenPrice(entry, TAKER, type, TAKER);
      expect(implicit.equals(explicit)).toBe(true);
    }
  });

  it("pins the exact long break-even, so a swapped entry/exit argument fails", () => {
    /*
     * 100 × (1 + 0.0002) / (1 - 0.0006). The inequality assertions below are
     * not enough on their own: feeding the rates in the wrong order still
     * produces a smaller number than the both-taker case, so they would pass
     * on an inverted formula. These digits would not — the swapped result is
     * 100.08001600320064013, and the two diverge at the sixth decimal.
     */
    const be = calculateBreakEvenPrice(
      new Decimal(100),
      MAKER,
      CONSTANTS.TRADE_TYPE_LONG,
      TAKER,
    );
    expect(be.toString()).toBe("100.08004802881729037");
  });

  it("pins the exact short break-even", () => {
    // 100 × (1 - 0.0002) / (1 + 0.0006); swapped would be 99.920015996800639872.
    const be = calculateBreakEvenPrice(
      new Decimal(100),
      MAKER,
      CONSTANTS.TRADE_TYPE_SHORT,
      TAKER,
    );
    expect(be.toString()).toBe("99.920047971217269638");
  });

  it("a cheaper maker entry moves a long's break-even closer to the entry price", () => {
    const entry = new Decimal(100);
    const bothTaker = calculateBreakEvenPrice(
      entry,
      TAKER,
      CONSTANTS.TRADE_TYPE_LONG,
      TAKER,
    );
    const makerEntry = calculateBreakEvenPrice(
      entry,
      MAKER,
      CONSTANTS.TRADE_TYPE_LONG,
      TAKER,
    );
    expect(makerEntry.lt(bothTaker)).toBe(true);
    expect(makerEntry.gt(entry)).toBe(true);
  });

  it("a cheaper maker entry moves a short's break-even closer from the other side", () => {
    const entry = new Decimal(100);
    const bothTaker = calculateBreakEvenPrice(
      entry,
      TAKER,
      CONSTANTS.TRADE_TYPE_SHORT,
      TAKER,
    );
    const makerEntry = calculateBreakEvenPrice(
      entry,
      MAKER,
      CONSTANTS.TRADE_TYPE_SHORT,
      TAKER,
    );
    expect(makerEntry.gt(bothTaker)).toBe(true);
    expect(makerEntry.lt(entry)).toBe(true);
  });
});

describe("calculateBaseMetrics — the split reaches the whole result", () => {
  it("a limit (maker) entry costs less to open than a market (taker) one", () => {
    const limitEntry = calculateBaseMetrics(
      tradeValues({ entryFees: MAKER, exitFees: TAKER }),
      CONSTANTS.TRADE_TYPE_LONG,
    );
    const marketEntry = calculateBaseMetrics(
      tradeValues({ entryFees: TAKER, exitFees: TAKER }),
      CONSTANTS.TRADE_TYPE_LONG,
    );

    expect(limitEntry).not.toBeNull();
    expect(marketEntry).not.toBeNull();
    expect(limitEntry!.entryFee.lt(marketEntry!.entryFee)).toBe(true);
    expect(limitEntry!.netLoss.lt(marketEntry!.netLoss)).toBe(true);
    // Position size is set by risk and stop distance alone, so the fee split
    // must not move it — only what that position costs to run.
    expect(limitEntry!.positionSize.equals(marketEntry!.positionSize)).toBe(true);
  });

  it("break-even reflects the per-leg rates rather than the flat one", () => {
    const split = calculateBaseMetrics(
      tradeValues({ entryFees: MAKER, exitFees: TAKER }),
      CONSTANTS.TRADE_TYPE_LONG,
    );
    const flat = calculateBaseMetrics(tradeValues(), CONSTANTS.TRADE_TYPE_LONG);
    expect(split!.breakEvenPrice.lt(flat!.breakEvenPrice)).toBe(true);
  });
});

describe("take-profit legs under asymmetric rates", () => {
  // A 2-unit position (1000 × 2% risk over a 10-wide stop), half sold at 120.
  const values = tradeValues({
    entryFees: MAKER,
    exitFees: TAKER,
    targets: [{ price: new Decimal(120), percent: new Decimal(50), isLocked: false }],
    totalPercentSold: new Decimal(50),
  });

  it("charges a partial exit at the exit rate and its entry share at the entry rate", () => {
    const base = calculateBaseMetrics(values, CONSTANTS.TRADE_TYPE_LONG)!;
    const tp = calculateIndividualTp(
      new Decimal(120),
      new Decimal(50),
      base,
      values,
      0,
    );

    // 1 unit out at 120 × 0.06% = 0.072; its entry share 1 × 100 × 0.02% = 0.02.
    expect(tp.exitFee.toString()).toBe("0.072");
    // Gross 20 on the part, minus both fee shares.
    expect(tp.netProfit.toString()).toBe("19.908");
  });

  it("totals both legs at their own rates", () => {
    const base = calculateBaseMetrics(values, CONSTANTS.TRADE_TYPE_LONG)!;
    const totals = calculateTotalMetrics(
      [{ price: new Decimal(120), percent: new Decimal(50) }],
      base,
      values,
      CONSTANTS.TRADE_TYPE_LONG,
    );

    // 0.02 in + 0.072 out. A flat 0.06% on both would give 0.132.
    expect(totals.totalFees.toString()).toBe("0.092");
    // Full 2 units to 120: gross 40, less 0.04 entry and 0.144 exit.
    expect(totals.maxPotentialProfit.toString()).toBe("39.816");
  });
});
