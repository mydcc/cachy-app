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
import { indicators } from "./indicators";
import { Decimal } from "decimal.js";

describe("indicators", () => {
  describe("calculateRSI", () => {
    it("should return null if insufficient data", () => {
      const prices = [1, 2, 3, 4, 5];
      expect(indicators.calculateRSI(prices, 14)).toBeNull();
    });

    it("should calculate RSI correctly for a simple uptrend", () => {
      // 15 prices (14 changes)
      // Just increasing by 1 every time
      const prices = [
        100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113,
        114,
      ];
      // Gains: 1, 1, 1... (14 times)
      // Losses: 0
      // AvgGain = 1, AvgLoss = 0 -> RSI = 100
      const rsi = indicators.calculateRSI(prices, 14);
      expect(rsi?.toNumber()).toBe(100);
    });

    it("should calculate RSI correctly for mixed data", () => {
      // Period = 2
      // Prices: 10, 12, 11, 13
      // Changes: +2, -1, +2
      // 1. Initial Avg (Changes 0, 1): (+2, -1) -> GainSum=2, LossSum=1 -> AvgGain=1, AvgLoss=0.5
      // 2. Next (Change +2):
      //    AvgGain = (1 * 1 + 2) / 2 = 1.5
      //    AvgLoss = (0.5 * 1 + 0) / 2 = 0.25
      //    RS = 6 -> RSI = 100 - 100/7 = 85.714

      const p = [10, 12, 11, 13];
      const rsi = indicators.calculateRSI(p, 2);
      expect(rsi?.toNumber()).toBeCloseTo(85.714, 2);
    });
  });

  describe("calculateSMA", () => {
    it("should return null if insufficient data", () => {
      const data = [new Decimal(1), new Decimal(2)];
      expect(indicators.calculateSMA(data, 3)).toBeNull();
    });

    it("should calculate SMA correctly", () => {
      const data = [10, 20, 30, 40, 50].map((n) => new Decimal(n));
      // SMA(3) of last 3: (30+40+50)/3 = 40
      const sma = indicators.calculateSMA(data, 3);
      expect(sma?.toNumber()).toBe(40);
    });
  });

  describe("calculateEMA", () => {
    it("should return null if insufficient data", () => {
      const data = [new Decimal(1), new Decimal(2)];
      expect(indicators.calculateEMA(data, 3)).toBeNull();
    });

    it("should calculate EMA correctly", () => {
      // Period 3. Multiplier k = 2/(3+1) = 0.5
      // Data: 10, 20, 30
      // Initial SMA (first 3): (10+20+30)/3 = 20. EMA = 20.
      const data = [10, 20, 30].map((n) => new Decimal(n));
      const ema1 = indicators.calculateEMA(data, 3);
      expect(ema1?.toNumber()).toBe(20);

      // Add 40.
      // EMA_prev = 20. Price = 40.
      // EMA = (40 - 20) * 0.5 + 20 = 10 + 20 = 30.
      const data2 = [10, 20, 30, 40].map((n) => new Decimal(n));
      const ema2 = indicators.calculateEMA(data2, 3);
      expect(ema2?.toNumber()).toBe(30);
    });
  });
});
