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
import { getRollingData } from "./stats";
import { Decimal } from "decimal.js";
import type { JournalEntry } from "../../stores/types";

// Helper to create dummy trades
const createTrade = (overrides: Partial<JournalEntry>): JournalEntry => ({
  id: "1",
  date: new Date().toISOString(),
  symbol: "BTCUSDT",
  tradeType: "Long",
  status: "Won",
  accountSize: new Decimal(10000),
  riskPercentage: new Decimal(1),
  leverage: new Decimal(10),
  fees: new Decimal(0),
  entryPrice: new Decimal(30000),
  stopLossPrice: new Decimal(29700),
  totalRR: new Decimal(2),
  totalNetProfit: new Decimal(300),
  riskAmount: 100, // can be number or string/decimal in real app, type says number | string
  totalFees: new Decimal(5),
  maxPotentialProfit: new Decimal(500),
  notes: "",
  targets: [],
  calculatedTpDetails: [],
  isManual: false,
  ...overrides,
});

describe("getRollingData", () => {
  it("returns null if not enough trades", () => {
    const trades = [createTrade({ status: "Won" })];
    expect(getRollingData(trades, 5)).toBeNull();
  });

  it("calculates rolling win rate correctly", () => {
    // Window size 3
    // T1: Won, T2: Lost, T3: Won, T4: Won
    // W1 (1-3): W, L, W => 66.66%
    // W2 (2-4): L, W, W => 66.66%

    const baseDate = new Date("2023-01-01").getTime();
    const trades = [
      createTrade({ id: "1", status: "Won", date: new Date(baseDate).toISOString() }),
      createTrade({ id: "2", status: "Lost", date: new Date(baseDate + 1000).toISOString() }),
      createTrade({ id: "3", status: "Won", date: new Date(baseDate + 2000).toISOString() }),
      createTrade({ id: "4", status: "Won", date: new Date(baseDate + 3000).toISOString() }),
    ];

    const result = getRollingData(trades, 3);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.winRates.length).toBe(2);
    expect(result.winRates[0]).toBeCloseTo(66.666, 1);
    expect(result.winRates[1]).toBeCloseTo(66.666, 1);
  });

  it("calculates rolling profit factor correctly", () => {
    // Window size 2
    // T1: +100
    // T2: -50
    // T3: +200

    // W1 (1-2): GrossWin 100, GrossLoss 50 => PF 2.0
    // W2 (2-3): GrossWin 200, GrossLoss 50 => PF 4.0

    const baseDate = new Date("2023-01-01").getTime();
    const trades = [
      createTrade({ id: "1", status: "Won", totalNetProfit: new Decimal(100), date: new Date(baseDate).toISOString() }),
      createTrade({ id: "2", status: "Lost", totalNetProfit: new Decimal(-50), date: new Date(baseDate + 1000).toISOString() }),
      createTrade({ id: "3", status: "Won", totalNetProfit: new Decimal(200), date: new Date(baseDate + 2000).toISOString() }),
    ];

    const result = getRollingData(trades, 2);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.profitFactors.length).toBe(2);
    expect(result.profitFactors[0]).toBe(2.0);
    expect(result.profitFactors[1]).toBe(4.0);
  });

  it("calculates rolling SQN correctly", () => {
    // SQN = (Avg R / StdDev R) * sqrt(N)
    // Window size 3
    // Risk = 100
    // T1: +200 (2R)
    // T2: -100 (-1R)
    // T3: +100 (1R)

    // R values: [2, -1, 1]
    // Avg R = 2/3 = 0.666...
    // Variance = ((2-0.66)^2 + (-1-0.66)^2 + (1-0.66)^2) / 3
    //          = (1.77 + 2.77 + 0.11) / 3 = 1.55
    // StdDev = sqrt(1.55) = 1.245
    // SQN = (0.666 / 1.245) * sqrt(3) = 0.53 * 1.732 = 0.92

    const baseDate = new Date("2023-01-01").getTime();
    const trades = [
      createTrade({ id: "1", status: "Won", totalNetProfit: new Decimal(200), riskAmount: 100, date: new Date(baseDate).toISOString() }),
      createTrade({ id: "2", status: "Lost", totalNetProfit: new Decimal(-100), riskAmount: 100, date: new Date(baseDate + 1000).toISOString() }),
      createTrade({ id: "3", status: "Won", totalNetProfit: new Decimal(100), riskAmount: 100, date: new Date(baseDate + 2000).toISOString() }),
    ];

    const result = getRollingData(trades, 3);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.sqnValues.length).toBe(1);

    // Verify calculation manually
    const r = [2, -1, 1];
    const avg = r.reduce((a,b)=>a+b,0)/3;
    const vari = r.reduce((a,b)=>a+(b-avg)**2,0)/3;
    const std = Math.sqrt(vari);
    const expectedSqn = (avg/std)*Math.sqrt(3);

    expect(result.sqnValues[0]).toBeCloseTo(expectedSqn, 2);
  });
});
