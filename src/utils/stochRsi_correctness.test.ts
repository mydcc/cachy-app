
import { describe, it, expect } from "vitest";
import { JSIndicators } from "./indicators";

describe("JSIndicators.stochRsi Correctness", () => {
  it("should return valid values (fix NaN propagation bug)", () => {
    const len = 100;
    const data = new Float64Array(len);
    for (let i = 0; i < len; i++) {
        data[i] = 100 + Math.sin(i * 0.1) * 10 + Math.cos(i * 0.5) * 5;
    }

    // Use parameters that trigger SMA usage (smoothK > 1 or dPeriod > 1)
    const res = JSIndicators.stochRsi(data, 14, 3, 3, 3);

    // Check that we have valid numbers at the end
    const lastK = res.k[len-1];
    const lastD = res.d[len-1];

    expect(lastK).not.toBeNaN();
    expect(lastD).not.toBeNaN();

    // Also check that it starts having values at some point
    // RSI valid at 14. Stoch(3) valid at 16. SmoothK(3) valid at 18. D(3) valid at 20.
    expect(res.k[18]).not.toBeNaN();
    expect(res.d[20]).not.toBeNaN();
  });
});
