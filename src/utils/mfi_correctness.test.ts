
import { describe, it, expect } from "vitest";
import { JSIndicators } from "./indicators";

// Copy types
type NumberArray = number[] | Float64Array;

// Legacy implementation (O(N*P)) - replicated from original source
function mfiLegacy(
    high: NumberArray,
    low: NumberArray,
    close: NumberArray,
    volume: NumberArray,
    period: number,
  ): Float64Array {
    const len = close.length;
    const result = new Float64Array(len).fill(NaN);
    if (len < period + 1) return result;

    const tp = new Float64Array(len);
    for(let i=0; i<len; i++) {
        tp[i] = (high[i] + low[i] + close[i]) / 3;
    }

    const moneyFlow = new Float64Array(len);
    for (let i = 0; i < len; i++) moneyFlow[i] = tp[i] * volume[i];

    const posFlow = new Float64Array(len).fill(0);
    const negFlow = new Float64Array(len).fill(0);

    // 1. Calculate Flows
    for (let i = 1; i < len; i++) {
      if (tp[i] > tp[i - 1]) {
        posFlow[i] = moneyFlow[i];
      } else if (tp[i] < tp[i - 1]) {
        negFlow[i] = moneyFlow[i];
      }
    }

    // 2. Sum over period (Nested Loop)
    for (let i = period; i < len; i++) {
      let sumPos = 0;
      let sumNeg = 0;
      for (let j = 0; j < period; j++) {
        sumPos += posFlow[i - j];
        sumNeg += negFlow[i - j];
      }

      if (sumPos + sumNeg === 0) {
        result[i] = 50;
      } else if (sumNeg === 0) {
        result[i] = 100;
      } else {
        const mfr = sumPos / sumNeg;
        result[i] = 100 - 100 / (1 + mfr);
      }
    }

    return result;
}

describe("MFI Correctness", () => {
    it("should match legacy implementation for random data", () => {
        const len = 1000;
        const high = new Float64Array(len);
        const low = new Float64Array(len);
        const close = new Float64Array(len);
        const volume = new Float64Array(len);

        for(let i=0; i<len; i++) {
            high[i] = 100 + Math.random() * 10;
            low[i] = 90 + Math.random() * 10;
            close[i] = (high[i] + low[i]) / 2;
            volume[i] = Math.random() * 1000;
        }

        const period = 14;

        const expected = mfiLegacy(high, low, close, volume, period);
        const actual = JSIndicators.mfi(high, low, close, volume, period);

        for(let i=0; i<len; i++) {
            if (isNaN(expected[i]) && isNaN(actual[i])) continue;
            expect(actual[i]).toBeCloseTo(expected[i], 8);
        }
    });

    it("should match legacy implementation for edge cases (zero volume)", () => {
        const len = 100;
        const high = new Float64Array(len).fill(10);
        const low = new Float64Array(len).fill(5);
        const close = new Float64Array(len).fill(8);
        const volume = new Float64Array(len).fill(0); // Zero volume

        const period = 5;

        const expected = mfiLegacy(high, low, close, volume, period);
        const actual = JSIndicators.mfi(high, low, close, volume, period);

        for(let i=0; i<len; i++) {
             if (isNaN(expected[i]) && isNaN(actual[i])) continue;
             expect(actual[i]).toBeCloseTo(expected[i], 8);
        }
    });
});
