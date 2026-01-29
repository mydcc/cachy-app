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
import { calculateAnalysisMetrics } from "./marketAnalyst";

// Helper to mock the complex structure expected by calculateAnalysisMetrics
function createTechMap(ema200?: number, rsi?: number) {
    return {
        "4h": {
            movingAverages: ema200 !== undefined ? [{ name: "EMA", params: "200", value: ema200 }] : [],
            oscillators: []
        },
        "1h": {
            movingAverages: [],
            oscillators: rsi !== undefined ? [{ name: "RSI", value: rsi }] : []
        }
    };
}

describe("calculateAnalysisMetrics", () => {
    it("should calculate bullish trend when price > ema200", () => {
        // Price 100, Open 90, EMA200 95, RSI 50
        const result = calculateAnalysisMetrics(100, 90, createTechMap(95, 50));
        expect(result.trend4h).toBe("bullish");
        expect(result.price).toBe("100");
    });

    it("should calculate bearish trend when price <= ema200", () => {
        // Price 90, Open 100, EMA200 95, RSI 50
        const result = calculateAnalysisMetrics(90, 100, createTechMap(95, 50));
        expect(result.trend4h).toBe("bearish");
    });

    it("should calculate correct change24h percent", () => {
        // (110 - 100) / 100 * 100 = 10%
        const result = calculateAnalysisMetrics(110, 100, createTechMap(105, 50));
        expect(result.change24h).toBe("10.00");
    });

    it("should handle overbought condition (RSI > 70)", () => {
        const result = calculateAnalysisMetrics(100, 99, createTechMap(90, 75));
        expect(result.condition).toBe("overbought");
    });

    it("should handle oversold condition (RSI < 30)", () => {
        const result = calculateAnalysisMetrics(100, 99, createTechMap(90, 25));
        expect(result.condition).toBe("oversold");
    });

    it("should handle trending condition (Change > 5% and RSI neutral)", () => {
        // 106 vs 100 = +6% change
        const result = calculateAnalysisMetrics(106, 100, createTechMap(90, 50));
        expect(result.change24h).toBe("6.00");
        expect(result.condition).toBe("trending");
    });

    it("should handle null inputs gracefully", () => {
        const result = calculateAnalysisMetrics(null, null, {});
        expect(result.price).toBe("0");
        expect(result.change24h).toBe("0.00");
        expect(result.rsi1h).toBe("50.00"); // Default to 50.00
        expect(result.condition).toBe("neutral");
    });

    it("should handle zero divisor for change24h", () => {
        const result = calculateAnalysisMetrics(100, 0, createTechMap(90, 50));
        expect(result.change24h).toBe("0.00");
    });

    it("should handle very small numbers without precision loss causing NaN", () => {
        // Shiba Inu style prices
        const price = "0.00000888";
        const open = "0.00000800"; // +11%
        const result = calculateAnalysisMetrics(price, open, createTechMap(0.00000850, 50));

        expect(result.price).toBe("0.00000888");
        expect(result.change24h).toBe("11.00");
        expect(result.condition).toBe("trending");
    });
});
