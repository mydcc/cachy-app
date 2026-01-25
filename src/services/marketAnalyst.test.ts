
import { describe, it, expect } from "vitest";
import { calculateAnalysisMetrics } from "./marketAnalyst";
import { Decimal } from "decimal.js";

describe("calculateAnalysisMetrics", () => {
    it("should calculate bullish trend when price > ema200", () => {
        const result = calculateAnalysisMetrics(100, 90, 95, 50);
        expect(result.trend4h).toBe("bullish");
        expect(result.price).toBe(100);
    });

    it("should calculate bearish trend when price <= ema200", () => {
        const result = calculateAnalysisMetrics(90, 100, 95, 50);
        expect(result.trend4h).toBe("bearish");
    });

    it("should calculate correct change24h percent", () => {
        // (110 - 100) / 100 * 100 = 10%
        const result = calculateAnalysisMetrics(110, 100, 105, 50);
        expect(result.change24h).toBe(10);
    });

    it("should handle overbought condition (RSI > 70)", () => {
        const result = calculateAnalysisMetrics(100, 99, 90, 75);
        expect(result.condition).toBe("overbought");
    });

    it("should handle oversold condition (RSI < 30)", () => {
        const result = calculateAnalysisMetrics(100, 99, 90, 25);
        expect(result.condition).toBe("oversold");
    });

    it("should handle trending condition (Change > 5% and RSI neutral)", () => {
        // 106 vs 100 = +6% change
        const result = calculateAnalysisMetrics(106, 100, 90, 50);
        expect(result.change24h).toBe(6);
        expect(result.condition).toBe("trending");
    });

    it("should handle null inputs gracefully", () => {
        const result = calculateAnalysisMetrics(null, null, null, null);
        expect(result.price).toBe(0);
        expect(result.change24h).toBe(0);
        expect(result.rsi1h).toBe(50); // Default to 50
        expect(result.condition).toBe("neutral");
    });

    it("should handle zero divisor for change24h", () => {
        const result = calculateAnalysisMetrics(100, 0, 90, 50);
        expect(result.change24h).toBe(0);
    });

    it("should handle very small numbers without precision loss causing NaN", () => {
        // Shiba Inu style prices
        const price = "0.00000888";
        const open = "0.00000800"; // +11%
        const result = calculateAnalysisMetrics(price, open, "0.00000850", 50);

        expect(result.price).toBe(0.00000888);
        expect(result.change24h).toBe(11);
        expect(result.condition).toBe("trending");
    });
});
