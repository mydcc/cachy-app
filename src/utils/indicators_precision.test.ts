import { describe, it, expect } from "vitest";
import { JSIndicators } from "./indicators";

describe("indicators precision", () => {
  describe("bb (Bollinger Bands)", () => {
    it("should handle high-value low-volatility assets without catastrophic cancellation", () => {
        // Base price 100,000 (BTC level)
        const base = 100000;
        // Alternating 0.1 spread: 100000.1, 100000.2, ...
        // True Variance of [x, x+d, x, x+d]...
        // Mean = x + d/2.
        // Deviations = -d/2, +d/2.
        // Variance = d^2 / 4.
        // StdDev = d / 2.
        // Here d=0.1. StdDev should be 0.05.

        const data: number[] = [];
        const len = 20;
        for (let i = 0; i < len; i++) {
            data.push(base + (i % 2 === 0 ? 0.1 : 0.2));
        }
        // Mean should be base + 0.15
        // Variance should be ((0.05)^2 + (-0.05)^2)/2 = 0.0025.
        // StdDev = 0.05.

        const res = JSIndicators.bb(data, 20, 2);

        // Check the last value
        // Upper = Middle + 2*StdDev
        // StdDev = (Upper - Middle) / 2
        const lastStdDev = (res.upper[len - 1] - res.middle[len - 1]) / 2;

        // Naive implementation gives ~0.08 or worse due to cancellation. Correct is 0.05.
        // We use a tight precision check.
        console.log("Calculated StdDev:", lastStdDev);
        expect(lastStdDev).toBeCloseTo(0.05, 6);
    });
  });
});
