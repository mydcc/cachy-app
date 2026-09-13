// @vitest-environment node
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
import { JSIndicators } from "./indicators";

describe("indicators precision", () => {
  /**
   * BUG-0450. `sma`, `wma` and `vwma` slide their window with O(1) running
   * sums. Every step adds a rounding error to those sums that is never removed,
   * so the drift grows with series length rather than staying at the level of
   * one window's arithmetic: WMA(10) was 6.5e-11 off the exact value at candle
   * 40 and 7e-10 at candle 360, and HMA — built from three WMAs — 4.6e-9 at 400.
   *
   * The reference below recomputes each window from scratch, so its own error
   * is one window's worth and independent of position. The bound is set at
   * that level: it holds for any series length only if the drift is bounded.
   */
  describe("sliding-window sums do not drift with series length", () => {
    const LENGTH = 5000;

    // Deterministic, BTC-scale, not smooth: an LCG walk around 50,000.
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const close: number[] = [];
    const volume: number[] = [];
    let price = 50000;
    for (let i = 0; i < LENGTH; i++) {
      price += (next() - 0.5) * 80;
      close.push(Math.round(price * 100) / 100);
      volume.push(Math.round(next() * 5000 * 1000) / 1000 + 1);
    }

    const direct = (period: number, at: (window: number[], offset: number) => number) =>
      close.map((_, i) => (i + 1 < period ? NaN : at(close.slice(i - period + 1, i + 1), i - period + 1)));

    const worst = (actual: Float64Array, expected: number[]) => {
      let max = 0;
      for (let i = 0; i < actual.length; i++) {
        if (Number.isNaN(expected[i])) continue;
        max = Math.max(max, Math.abs(actual[i] - expected[i]));
      }
      return max;
    };

    // One window's arithmetic at this price scale is ~1e-11; three orders of
    // headroom, and still an order below the drift measured at 400 candles.
    const BOUND = 1e-9;

    for (const period of [10, 20, 50]) {
      it(`sma(${period})`, () => {
        const expected = direct(period, (w) => w.reduce((a, b) => a + b, 0) / period);
        expect(worst(JSIndicators.sma(close, period), expected)).toBeLessThan(BOUND);
      });

      it(`wma(${period})`, () => {
        const denominator = (period * (period + 1)) / 2;
        const expected = direct(
          period,
          (w) => w.reduce((a, v, k) => a + v * (k + 1), 0) / denominator,
        );
        expect(worst(JSIndicators.wma(close, period), expected)).toBeLessThan(BOUND);
      });

      it(`vwma(${period})`, () => {
        const expected = direct(period, (w, offset) => {
          let pv = 0;
          let v = 0;
          for (let k = 0; k < w.length; k++) {
            pv += w[k] * volume[offset + k];
            v += volume[offset + k];
          }
          return pv / v;
        });
        expect(worst(JSIndicators.vwma(close, volume, period), expected)).toBeLessThan(BOUND);
      });
    }
  });

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
