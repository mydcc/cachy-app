// @vitest-environment node
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
import { indicators, JSIndicators } from "./indicators";
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

  describe("wma", () => {
    it("should calculate WMA correctly", () => {
      // Prices: 10, 20, 30. Period 3.
      // Denom = 3*4/2 = 6.
      // Sum = 10*1 + 20*2 + 30*3 = 10 + 40 + 90 = 140.
      // WMA = 140 / 6 = 23.333...

      const data = [10, 20, 30];
      const res = JSIndicators.wma(data, 3);
      expect(res[2]).toBeCloseTo(23.333, 2);

      // Next: 40. Window: 20, 30, 40.
      // Sum = 20*1 + 30*2 + 40*3 = 20 + 60 + 120 = 200.
      // WMA = 200 / 6 = 33.333...
      const data2 = [10, 20, 30, 40];
      const res2 = JSIndicators.wma(data2, 3);
      expect(res2[3]).toBeCloseTo(33.333, 2);
    });
  });


  describe("ichimoku", () => {
    it("should calculate ichimoku correctly", () => {
      // Create a pattern where max/min changes
      const len = 20;
      const high = Array.from({ length: len }, (_, i) => 10 + i);
      const low = Array.from({ length: len }, (_, i) => i);
      const close = Array.from({ length: len }, (_, i) => 5 + i);
      // Conv (Period 3): Max(i, i-1, i-2) = 10+i. Min = i-2.
      // Avg = (10+i + i-2)/2 = (8 + 2i)/2 = 4 + i.
      // At i=2: Avg = 4+2 = 6.

      const res = JSIndicators.ichimoku(high, low, close, 3, 5, 10, 5);
      expect(res.conversion[2]).toBe(6);
      expect(res.conversion[3]).toBe(7);
    });

    it("computes lagging span as close shifted back by laggingSpan2", () => {
      const len = 30;
      const high = Array.from({ length: len }, (_, i) => 20 + i);
      const low = Array.from({ length: len }, (_, i) => 10 + i);
      const close = Array.from({ length: len }, (_, i) => 100 + i);
      const lag = 5;

      const res = JSIndicators.ichimoku(high, low, close, 3, 5, 10, lag);

      // Chikou: the close of t+lag plotted at t.
      for (let i = 0; i < len - lag; i++) {
        expect(res.lagging[i]).toBe(100 + i + lag);
      }
      // Beyond the lookahead window there is no future close to plot.
      for (let i = len - lag; i < len; i++) {
        expect(Number.isNaN(res.lagging[i])).toBe(true);
      }
    });

    it("uses laggingSpan2 as the displacement for spanA/spanB", () => {
      const len = 60;
      const high = Array.from({ length: len }, (_, i) => 20 + i);
      const low = Array.from({ length: len }, (_, i) => 10 + i);
      const close = Array.from({ length: len }, (_, i) => 15 + i);

      // Default-style settings: displacement (5) equals basePeriod (5),
      // so results must match the historical hardcoded behavior.
      const withMatch = JSIndicators.ichimoku(high, low, close, 3, 5, 10, 5);
      // A different displacement must actually move the spans.
      const withWider = JSIndicators.ichimoku(high, low, close, 3, 5, 10, 10);

      expect(withWider.spanA[10]).toBe(withMatch.spanA[5]);
      expect(withWider.spanB[10]).toBe(withMatch.spanB[5]);
    });
  });

  describe("stoch", () => {
    it("should calculate stochastic correctly", () => {
      // High: 10, 20, 30
      // Low: 5, 15, 25
      // Close: 8, 18, 28
      // Period 3.
      // i=2. MaxHigh(30, 20, 10) = 30. MinLow(25, 15, 5) = 5. Range=25.
      // Close=28. (28-5)/25 * 100 = 23/25*100 = 92.

      const high = [10, 20, 30];
      const low = [5, 15, 25];
      const close = [8, 18, 28];

      const res = JSIndicators.stoch(high, low, close, 3);
      expect(res[2]).toBe(92);
    });
  });

  describe("bb", () => {
    it("should calculate bollinger bands correctly", () => {
      // 10, 20, 30.
      // SMA(3) = 20.
      // Var = ((10-20)^2 + (20-20)^2 + (30-20)^2)/3 = (100 + 0 + 100)/3 = 200/3 = 66.666.
      // StdDev = sqrt(66.666) = 8.1649.
      // Upper = 20 + 2*8.1649 = 36.329.
      // Lower = 20 - 16.329 = 3.67.

      const data = [10, 20, 30];
      const res = JSIndicators.bb(data, 3, 2);
      expect(res.middle[2]).toBe(20);
      expect(res.upper[2]).toBeCloseTo(36.33, 1);
      expect(res.lower[2]).toBeCloseTo(3.67, 1);
    });
  });

  describe("vwma", () => {
    it("should calculate VWMA correctly", () => {
      // Price: 10, 20, 30. Vol: 1, 2, 3.
      // SumP*V = 10*1 + 20*2 + 30*3 = 10 + 40 + 90 = 140.
      // SumV = 1 + 2 + 3 = 6.
      // VWMA = 140/6 = 23.333
      const price = [10, 20, 30];
      const vol = [1, 2, 3];
      const res = JSIndicators.vwma(price, vol, 3);
      expect(res[2]).toBeCloseTo(23.333, 2);
    });
  });

  describe("hma", () => {
    it("should calculate HMA correctly", () => {
      const data = Array.from({length: 20}, (_, i) => (i + 1) * 10);
      const res = JSIndicators.hma(data, 9);
      expect(res[19]).not.toBeNaN();
      expect(res[19]).toBeGreaterThan(190);
    });
  });

  /**
   * BUG-0456. The first candle has no previous close, so it has no true range.
   * Counting it as 0 dragged the first period's average down and every Wilder
   * step after it, decaying only over hundreds of candles.
   */
  describe("atr", () => {
    //                 0   1   2   3   4
    const high = [12, 13, 16, 14, 20];
    const low = [8, 9, 11, 13, 14];
    const close = [10, 12, 14, 13, 19];
    // True ranges from candle 1: 4, 5, 1, 7.

    it("has no value until a full period of true ranges exists", () => {
      const res = JSIndicators.atr(high, low, close, 3);
      expect(Array.from(res.slice(0, 3)).every(Number.isNaN)).toBe(true);
    });

    it("seeds from the first period's true ranges, then smooths by Wilder's rule", () => {
      const res = JSIndicators.atr(high, low, close, 3);
      expect(res[3]).toBeCloseTo((4 + 5 + 1) / 3, 12);
      expect(res[4]).toBeCloseTo((((4 + 5 + 1) / 3) * 2 + 7) / 3, 12);
    });

    it("answers null from calculateATR until a full period of true ranges exists", () => {
      expect(indicators.calculateATR(high.slice(0, 3), low.slice(0, 3), close.slice(0, 3), 3)).toBeNull();
      expect(indicators.calculateATR(high.slice(0, 4), low.slice(0, 4), close.slice(0, 4), 3)?.toNumber())
        .toBeCloseTo(10 / 3, 12);
    });
  });

  /**
   * BUG-0458. The final bands started as NaN and every later candle compared
   * against them, so no candle ever had a value and the trend never left "up".
   */
  describe("superTrend", () => {
    //                 0   1   2    3
    const high = [10, 11, 12, 14];
    const low = [8, 9, 10, 9.6];
    const close = [9, 10, 11, 10.1];
    // True ranges from candle 1: 2, 2, 4.4. ATR(2): 2 at candle 2, 3.2 at candle 3.

    it("has no value until a full period of true ranges exists", () => {
      const res = JSIndicators.superTrend(high, low, close, 2, 0.5);
      for (const line of [res.value, res.upper, res.lower]) {
        expect(Array.from(line.slice(0, 2)).every(Number.isNaN)).toBe(true);
      }
    });

    it("starts from the basic bands on its first candle with an ATR, in an uptrend", () => {
      const res = JSIndicators.superTrend(high, low, close, 2, 0.5);
      // hl2 11 ± 0.5 × 2
      expect(res.upper[2]).toBeCloseTo(12, 12);
      expect(res.lower[2]).toBeCloseTo(10, 12);
      expect(res.trend[2]).toBe(1);
      expect(res.value[2]).toBeCloseTo(10, 12);
    });

    it("flips on a close through the band of the same candle, not the one before", () => {
      const res = JSIndicators.superTrend(high, low, close, 2, 0.5);
      // hl2 11.8 − 0.5 × 3.2 = 10.2 tightens the lower band; the close of 10.1
      // is below it, though not below the previous candle's 10.
      expect(res.lower[3]).toBeCloseTo(10.2, 12);
      expect(res.upper[3]).toBeCloseTo(12, 12);
      expect(res.trend[3]).toBe(-1);
      expect(res.value[3]).toBeCloseTo(12, 12);
    });

    it("answers null from calculateSuperTrend until a full period of true ranges exists", () => {
      expect(indicators.calculateSuperTrend(high.slice(0, 2), low.slice(0, 2), close.slice(0, 2), 2, 0.5)).toBeNull();
      expect(indicators.calculateSuperTrend(high.slice(0, 3), low.slice(0, 3), close.slice(0, 3), 2, 0.5)?.value.toNumber())
        .toBeCloseTo(10, 12);
    });
  });
});

describe("indicators wrappers", () => {
  describe("calculateMACD", () => {
    it("should calculate MACD correctly", () => {
       const data = Array(50).fill(10);
       const res = indicators.calculateMACD(data);
       expect(res).not.toBeNull();
       expect(res?.macd.toNumber()).toBe(0);
    });
  });
});

