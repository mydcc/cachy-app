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
  getExecutionEfficiencyData,
  getVisualRiskRadarData,
  getVolatilityMatrixData,
} from "./charts";
import type { JournalEntry } from "../../stores/types";

// Helper to create dummy trades
const createTrade = (overrides: Partial<JournalEntry>): JournalEntry => ({
  id: 1,
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
  riskAmount: new Decimal(100),
  totalFees: new Decimal(5),
  maxPotentialProfit: new Decimal(500),
  notes: "",
  targets: [],
  calculatedTpDetails: [],
  ...overrides,
});

describe("New Deep Dive Charts", () => {
  describe("getExecutionEfficiencyData (MFE vs MAE)", () => {
    it("should return empty scatter points if journal is empty", () => {
      const data = getExecutionEfficiencyData([]);
      expect(data.scatterPoints).toEqual([]);
    });

    it("should skip trades without MAE/MFE", () => {
      const trades = [createTrade({ mae: undefined, mfe: undefined })];
      const data = getExecutionEfficiencyData(trades);
      expect(data.scatterPoints).toEqual([]);
    });

    it("should calculate correct R-multiples for scatter points", () => {
      const trades = [
        createTrade({
          mae: new Decimal(50), // 0.5R (Risk 100)
          mfe: new Decimal(200), // 2.0R
          riskAmount: new Decimal(100),
          totalNetProfit: new Decimal(150),
          symbol: "BTC",
        }),
      ];
      const data = getExecutionEfficiencyData(trades);
      expect(data.scatterPoints).toHaveLength(1);
      const point = data.scatterPoints[0];

      expect(point.x).toBe(0.5); // MAE / Risk
      expect(point.y).toBe(2.0); // MFE / Risk
      expect(point.pnl).toBe(1.5); // PnL / Risk
      expect(point.l).toContain("BTC");
      expect(point.l).toContain("Eff:");
    });

    it("should handle trades with zero risk amount gracefully (fallback to raw values)", () => {
      const trades = [
        createTrade({
          mae: new Decimal(50),
          mfe: new Decimal(200),
          riskAmount: new Decimal(0),
          totalNetProfit: new Decimal(150),
        }),
      ];
      const data = getExecutionEfficiencyData(trades);
      expect(data.scatterPoints).toHaveLength(1);
      const point = data.scatterPoints[0];

      // If risk is 0, it should fallback to raw values or handle division by zero
      // In code: const x = useR ? mae / risk : mae;
      // useR = risk > 0. So it uses mae.
      expect(point.x).toBe(50);
      expect(point.y).toBe(200);
    });
  });

  describe("getVolatilityMatrixData (ATR Matrix)", () => {
    it("should group trades by ATR volatility", () => {
      const trades = [
        createTrade({
          atrValue: new Decimal(10),
          totalNetProfit: new Decimal(100),
          status: "Won",
        }), // Low
        createTrade({
          atrValue: new Decimal(50),
          totalNetProfit: new Decimal(200),
          status: "Won",
        }), // Normal (Avg)
        createTrade({
          atrValue: new Decimal(100),
          totalNetProfit: new Decimal(-50),
          status: "Lost",
        }), // High
      ];
      // Avg ATR = (10+50+100)/3 = 53.33
      // Low < 42.6 (0.8 * 53) -> 10 is Low
      // High > 64 (1.2 * 53) -> 100 is High
      // Normal: 50 is Normal

      const data = getVolatilityMatrixData(trades);
      expect(data).not.toBeNull();

      expect(data?.low.count).toBe(1);
      expect(data?.low.pnl).toBe(100);
      expect(data?.low.winRate).toBe(100);

      expect(data?.normal.count).toBe(1);
      expect(data?.normal.pnl).toBe(200);

      expect(data?.high.count).toBe(1);
      expect(data?.high.pnl).toBe(-50);
      expect(data?.high.winRate).toBe(0);
    });

    it("should return null if no trades have ATR", () => {
      const trades = [createTrade({ atrValue: undefined })];
      const data = getVolatilityMatrixData(trades);
      expect(data).toBeNull();
    });
  });

  describe("getVisualRiskRadarData", () => {
    it("should calculate normalized scores", () => {
      const trades = [
        // Win
        createTrade({
          status: "Won",
          totalNetProfit: new Decimal(200),
          riskAmount: new Decimal(100),
        }),
        // Loss - MUST HAVE NEGATIVE PNL for stats to count it as loss amount
        createTrade({
          status: "Lost",
          totalNetProfit: new Decimal(-100),
          riskAmount: new Decimal(100),
        }),
      ];
      // Win Rate: 50%
      // Profit Factor: 200 / 100 = 2.0
      // Avg Win: 200, Avg Loss: 100 -> RR: 2.0
      // Avg R: (2R + -1R) / 2 = 0.5R

      const data = getVisualRiskRadarData(trades);

      expect(data.raw.winRate).toBe(50);
      expect(data.raw.pf).toBe(2.0);
      expect(data.raw.rr).toBe(2.0);

      // Scores are scaled
      // PF Score: min(2, 5)/5 * 100 = 40
      expect(data.data[1]).toBe(40);
    });
  });
});
