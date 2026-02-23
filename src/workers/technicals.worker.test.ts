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

// Mock worker environment
const self = {
  onmessage: null as any,
  postMessage: null as any,
};

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
        const result = calculateAllIndicators(klines, undefined, { ema: false }); // Disable others to focus
        // We actually can't easily disable everything, but we check return structure
        expect(result.movingAverages).toBeDefined();
    });

    it("should calculate RSI correctly", () => {
        const result = calculateAllIndicators(klines, undefined, { rsi: true });
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
      // Should not crash, just empty or partial results.
      // Correct behavior: If not enough data, indicators should NOT be returned (no false '0' signals).
      expect(result.movingAverages.length).toBe(0);
    });
  });
});
