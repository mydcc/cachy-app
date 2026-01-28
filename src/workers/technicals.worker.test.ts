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
import { calculateAllIndicators } from "../utils/technicalsCalculator";
import { JSIndicators } from "../utils/indicators";
import { Decimal } from "decimal.js";

describe("technicals.worker", () => {
  // 1. Test JSIndicators helper functions
  describe("JSIndicators", () => {
    it("should calculate SMA correctly", () => {
      const data = [1, 2, 3, 4, 5];
      const sma = JSIndicators.sma(data, 3);
      // Result: [0, 0, 2, 3, 4]
      expect(sma[2]).toBe(2);
      expect(sma[4]).toBe(4);
    });

    it("should calculate RSI correctly", () => {
      // Simplified RSI test
      const data = [10, 12, 11, 13, 15, 14, 16]; // 7 points
      const rsi = JSIndicators.rsi(data, 5);
      // Just verifying it produces a number in range 0-100 after period
      expect(rsi[5]).toBeGreaterThanOrEqual(0);
      expect(rsi[5]).toBeLessThanOrEqual(100);
    });
  });

  // 2. Test Main Logic
  describe("calculateAllIndicators", () => {
    const mockKlines = Array(200)
      .fill(0)
      .map((_, i) => ({
        time: 1000 + i,
        open: new Decimal(100 + i),
        high: new Decimal(105 + i),
        low: new Decimal(95 + i),
        close: new Decimal(102 + i),
        volume: new Decimal(1000),
      }));

    it("should return all indicators populated", () => {
      const result = calculateAllIndicators(mockKlines, {
        rsi: { length: 14 },
        ema: {
          ema1: { length: 9 },
          ema2: { length: 21 },
          ema3: { length: 50 },
        },
      } as any);

      expect(result.oscillators).toBeDefined();
      expect(result.movingAverages).toBeDefined();
      expect(result.pivots).toBeDefined();
      expect(result.summary).toBeDefined();

      // Check RSI existence
      const rsi = result.oscillators.find((o: any) => o.name === "RSI");
      expect(rsi).toBeDefined();
      expect(rsi!.value).not.toBe("NaN");
    });

    it("should handle incomplete data gracefully", () => {
      const shortKlines = mockKlines.slice(0, 5); // Too short for EMA 9
      const result = calculateAllIndicators(shortKlines, {
        ema: { ema1: { length: 9 } },
      } as any);

      // Should not crash, just empty or partial results (MAs return 0 if not enough data)
      expect(result.movingAverages.length).toBe(3);
      expect(result.movingAverages[0].value.toNumber()).toBe(0);
    });
  });
});
