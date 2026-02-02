import { describe, it, expect } from "vitest";
import { slidingWindowMax, slidingWindowMin } from "./slidingWindow";

describe("Sliding Window Algorithms", () => {
  it("should calculate sliding window max correctly", () => {
    const data = [1, 3, -1, -3, 5, 3, 6, 7];
    const k = 3;
    const expected = [NaN, NaN, 3, 3, 5, 5, 6, 7];
    // Window position and max:
    // [1, 3, -1] -> 3 (index 2)
    // [3, -1, -3] -> 3 (index 3)
    // [-1, -3, 5] -> 5 (index 4)
    // [-3, 5, 3] -> 5 (index 5)
    // [5, 3, 6] -> 6 (index 6)
    // [3, 6, 7] -> 7 (index 7)

    const result = slidingWindowMax(data, k);
    expect(result).toEqual(expected);
  });

  it("should calculate sliding window min correctly", () => {
    const data = [1, 3, -1, -3, 5, 3, 6, 7];
    const k = 3;
    const expected = [NaN, NaN, -1, -3, -3, -3, 3, 3];
    // Window position and min:
    // [1, 3, -1] -> -1
    // [3, -1, -3] -> -3
    // [-1, -3, 5] -> -3
    // [-3, 5, 3] -> -3
    // [5, 3, 6] -> 3
    // [3, 6, 7] -> 3

    const result = slidingWindowMin(data, k);
    expect(result).toEqual(expected);
  });

  it("should handle period > length", () => {
    const data = [1, 2, 3];
    const k = 5;
    const result = slidingWindowMax(data, k);
    expect(result).toEqual([NaN, NaN, NaN]);
  });

  it("should handle period = 1", () => {
    const data = [1, 5, 2];
    const k = 1;
    expect(slidingWindowMax(data, k)).toEqual([1, 5, 2]);
    expect(slidingWindowMin(data, k)).toEqual([1, 5, 2]);
  });

  it("should match naive implementation for random data", () => {
      const len = 100;
      const data = new Array(len).fill(0).map(() => Math.random() * 100);
      const k = 10;

      const naiveMax = new Array(len).fill(NaN);
      const naiveMin = new Array(len).fill(NaN);

      for(let i=k-1; i<len; i++) {
          let max = -Infinity;
          let min = Infinity;
          for(let j=0; j<k; j++) {
              const val = data[i-j];
              if(val > max) max = val;
              if(val < min) min = val;
          }
          naiveMax[i] = max;
          naiveMin[i] = min;
      }

      const fastMax = slidingWindowMax(data, k);
      const fastMin = slidingWindowMin(data, k);

      expect(fastMax).toEqual(naiveMax);
      expect(fastMin).toEqual(naiveMin);
  });
});
