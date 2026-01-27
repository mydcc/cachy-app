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


import { JSIndicators } from "./indicators";

describe("JSIndicators", () => {
  describe("psar", () => {
    it("should calculate PSAR correctly", () => {
      // Simple uptrend
      const high = [10, 11, 12, 13, 14, 15];
      const low = [9, 10, 11, 12, 13, 14];
      // Start long. EP=10, SAR=9.
      // i=1: NextSAR = 9 + 0.02*(10-9) = 9.02. Long constraint: check low[0]=9. OK.
      // Update: high[1]=11 > ep=10. New EP=11, AF=0.04.

      const res = JSIndicators.psar(high, low);
      expect(res[0]).toBe(9);
      expect(res[1]).toBe(9);
      expect(res.length).toBe(6);
    });

    it("should flip trend", () => {
      const high = [10, 12, 8];
      const low = [8, 10, 4];
      // 0: Init Long. SAR=8. EP=10.
      // 1: NextSAR=8+0.02*2=8.04. Checks passed. High[1]=12>10 -> EP=12, AF=0.04.
      // SAR[1]=8.04.
      // 2: NextSAR=8.04+0.04*(12-8.04) = 8.1984.
      // Low[2]=4 < SAR(8.1984). Flip Short!
      // SAR[2] = EP(12). New EP=4. AF=0.02.

      const res = JSIndicators.psar(high, low);
      expect(res[2]).toBe(12);
    });
  });

  describe("vwap", () => {
    it("should reset on session change", () => {
      // 4 candles. 2 days.
      // Day 1: Price=10, Vol=100.
      // Day 1: Price=10, Vol=100. -> CumVol=200, CumVP=2000. VWAP=10.
      // Day 2: Price=20, Vol=100. -> MUST RESET. CumVol=100, CumVP=2000. VWAP=20.
      // If no reset: CumVol=300, CumVP=4000. VWAP=13.33.

      const high = [10, 10, 20, 20];
      const low = [10, 10, 20, 20];
      const close = [10, 10, 20, 20];
      const vol = [100, 100, 100, 100];

      const t1 = new Date("2023-01-01T10:00:00Z").getTime();
      const t2 = new Date("2023-01-01T11:00:00Z").getTime();
      const t3 = new Date("2023-01-02T10:00:00Z").getTime(); // Next Day
      const t4 = new Date("2023-01-02T11:00:00Z").getTime();

      const time = [t1, t2, t3, t4];

      const res = JSIndicators.vwap(high, low, close, vol, time, { mode: "session" });

      expect(res[0]).toBe(10);
      expect(res[1]).toBe(10);
      expect(res[2]).toBe(20); // Reset confirmed
      expect(res[3]).toBe(20);
    });

    it("should accumulate if no session mode", () => {
      const high = [10, 10, 20];
      const low = [10, 10, 20];
      const close = [10, 10, 20];
      const vol = [100, 100, 100];

      // Time doesn't matter without session mode
      const time = [0, 0, 0];

      const res = JSIndicators.vwap(high, low, close, vol, time); // Default
      // 1: 10
      // 2: 10
      // 3: (10*100 + 10*100 + 20*100) / 300 = 4000/300 = 13.333
      expect(res[2]).toBeCloseTo(13.333, 2);
    });
  });
});
