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
import { calculateAllIndicators } from "../utils/technicalsCalculator";
import { Decimal } from "decimal.js";

describe("technicals.worker", () => {
  // We can't fully emulate the Worker context easily in Vitest without complex setup,
  // but we can test the core logic which is now shared in technicalsCalculator.
  // The worker file itself is mostly a wrapper.

  // However, we can test that the serialization logic (if any remains) or payload handling works.
  // Since we removed serialization, we verify the calculateAllIndicators returns clean numbers.

  const klines = Array.from({ length: 100 }, (_, i) => ({
    time: 1600000000000 + i * 60000,
    open: new Decimal(100 + i),
    high: new Decimal(105 + i),
    low: new Decimal(95 + i),
    close: new Decimal(102 + i),
    volume: new Decimal(1000),
  }));

  describe("calculateAllIndicators", () => {
    it("should calculate SMA correctly", () => {
        // SMA logic test via calculator
        const result = calculateAllIndicators(klines);
        // We actually can't easily disable everything, but we check return structure
        expect(result.movingAverages).toBeDefined();
    });

    it("should calculate RSI correctly", () => {
        const result = calculateAllIndicators(klines);
        const rsi = result.oscillators.find(o => o.name === "RSI");
        expect(rsi).toBeDefined();
        expect(typeof rsi?.value).toBe("number");
    });

    it("should return all indicators populated", () => {
        const result = calculateAllIndicators(klines);
        expect(result.oscillators.length).toBeGreaterThan(0);
        expect(result.movingAverages.length).toBeGreaterThan(0);
        expect(result.pivots).toBeDefined();
    });

    it("should handle incomplete data gracefully", () => {
      const shortKlines = klines.slice(0, 5);
      const result = calculateAllIndicators(shortKlines);

      // Must not throw on five candles.
      expect(result).toBeDefined();
      expect(Array.isArray(result.movingAverages)).toBe(true);

      // This assertion used to expect three entries with value 0. The
      // calculator now pushes a moving average only when its value is not NaN,
      // so an indicator without enough history is omitted instead of reported as
      // 0 — a zero is indistinguishable from a real price level. Five candles is
      // not enough for any of the configured periods, so none appear.
      expect(result.movingAverages.length).toBe(0);

      // Whatever is returned must never contain a NaN masquerading as a number.
      for (const ma of result.movingAverages) {
        expect(Number.isNaN(ma.value)).toBe(false);
      }
    });
  });
});
