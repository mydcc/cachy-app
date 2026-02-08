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
import { getQualityData } from "./charts";
import type { JournalEntry } from "../../stores/types";

// Helper to create dummy trades
const createTrade = (id: number, status: "Won" | "Lost", pnl: number, risk: number, dateStr: string): JournalEntry => ({
  id,
  date: dateStr,
  symbol: "BTCUSDT",
  tradeType: "Long",
  status,
  accountSize: new Decimal(10000),
  riskPercentage: new Decimal(1),
  leverage: new Decimal(10),
  fees: new Decimal(0),
  entryPrice: new Decimal(30000),
  stopLossPrice: new Decimal(29000),
  totalRR: new Decimal(risk > 0 ? pnl/risk : 0),
  totalNetProfit: new Decimal(pnl),
  riskAmount: new Decimal(risk),
  totalFees: new Decimal(5),
  maxPotentialProfit: new Decimal(500),
  notes: "",
  targets: [],
  calculatedTpDetails: [],
});

describe("getQualityData Loop Optimization", () => {
  it("should calculate all metrics correctly matching the baseline", () => {
    const trades: JournalEntry[] = [
      createTrade(1, "Won", 200, 100, "2023-01-01T10:00:00Z"), // 2R
      createTrade(2, "Lost", -100, 100, "2023-01-02T10:00:00Z"), // -1R
      createTrade(3, "Won", 50, 100, "2023-01-03T10:00:00Z"), // 0.5R
      createTrade(4, "Lost", -50, 100, "2023-01-04T10:00:00Z"), // -0.5R
      createTrade(5, "Won", 300, 100, "2023-01-05T10:00:00Z"), // 3R
    ];

    const data = getQualityData(trades);

    expect(data.winLossData).toEqual([3, 2]); // 3 Won, 2 Lost
    expect(data.sixSegmentData).toEqual([3, 0, 2, 0, 0, 0]);

    expect(data.rHistogram).toEqual({
      "<-1R": 0,
      "-1R to 0R": 2,
      "0R to 1R": 1,
      "1R to 2R": 0,
      "2R to 3R": 1,
      ">3R": 1,
    });

    const curve = data.cumulativeRCurve.map(p => p.y);
    expect(curve).toEqual([2, 1, 1.5, 1.0, 4.0]);
  });
});
