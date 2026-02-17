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
import { calculateAllIndicators } from "./technicalsCalculator";
import { Decimal } from "decimal.js";

describe("technicalsCalculator reproduction", () => {
  it("should return 0 for EMA(200) if insufficient data", () => {
    // 100 candles
    const klines = Array.from({ length: 150 }, (_, i) => ({
      time: i * 60000,
      open: new Decimal(100 + i),
      high: new Decimal(105 + i),
      low: new Decimal(95 + i),
      close: new Decimal(102 + i),
      volume: new Decimal(1000),
    }));

    const result = calculateAllIndicators(klines, {
      ema: { ema3: { length: 200 }, source: "close" }
    } as any, { ema: true, bb: true });

    // EMA(200) should NOT be present if insufficient data
    const ema200 = result.movingAverages.find(ma => ma.params === "200");
    expect(ema200).toBeUndefined();
  });

  it("should return undefined BB if insufficient data for BB", () => {
     // BB Period 20. Provide 10 candles.
     const klines = Array.from({ length: 10 }, (_, i) => ({
      time: i * 60000,
      open: new Decimal(100 + i),
      high: new Decimal(105 + i),
      low: new Decimal(95 + i),
      close: new Decimal(102 + i),
      volume: new Decimal(1000),
    }));

    const result = calculateAllIndicators(klines, {
        bollingerBands: { length: 20 }
    } as any, { bollingerBands: true });

    expect(result.volatility?.bb).toBeDefined();
    expect(result.volatility?.bb?.upper).toBeNaN();
    expect(result.volatility?.bb?.middle).toBeNaN();
    expect(result.volatility?.bb?.lower).toBeNaN();
  });

  it("should calculate BB correctly with sufficient data", () => {
      // 300 candles, clear data
      const klines = Array.from({ length: 300 }, (_, i) => ({
        time: i * 60000,
        open: new Decimal(100 + i),
        high: new Decimal(105 + i),
        low: new Decimal(95 + i),
        close: new Decimal(100 + i), // steady uptrend
        volume: new Decimal(1000),
      }));
  
      const result = calculateAllIndicators(klines, {
          bollingerBands: { length: 20, stdDev: 2 }
      } as any, { bollingerBands: true });
  
      expect(result.volatility?.bb).toBeDefined();
      expect(result.volatility?.bb?.upper).not.toBeNaN();
      // SMA of last 20: (280..299). Sum = (100+280 + 100+299)*20/2 = (380+399)*10 = 7790. SMA = 389.5.
      // Upper should be around there.
      expect(result.volatility?.bb?.middle).toBeGreaterThan(0);
  });
});
