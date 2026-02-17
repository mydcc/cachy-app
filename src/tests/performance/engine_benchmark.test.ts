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

/*
 * Copyright (C) 2026 MYDCT
 *
 * Performance Benchmarking Tests
 * Measures TypeScript calculation path across dataset sizes.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { calculateAllIndicators } from '../../utils/technicalsCalculator';
import type { Kline } from '../../services/technicalsTypes';

/**
 * Generate synthetic OHLCV klines for benchmarking
 */
function generateKlines(count: number): Kline[] {
  const klines: Kline[] = [];
  let price = 100;
  const baseTime = Date.now() - count * 60000;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 0.5;
    const low = Math.min(open, close) - Math.random() * 0.5;
    const volume = 1000 + Math.random() * 9000;

    klines.push({
      time: baseTime + i * 60000,
      open: new Decimal(open),
      high: new Decimal(high),
      low: new Decimal(low),
      close: new Decimal(close),
      volume: new Decimal(volume),
    });
    price = close;
  }
  return klines;
}

describe('Engine Performance Benchmarks', () => {
  const sizes = [100, 1000, 5000, 10000];

  for (const size of sizes) {
    it(`calculates ${size} candles within budget`, () => {
      const klines = generateKlines(size);

      // Warmup run
      calculateAllIndicators(klines);

      // Measured runs
      const runs: number[] = [];
      const numRuns = 5;

      for (let i = 0; i < numRuns; i++) {
        const start = performance.now();
        calculateAllIndicators(klines);
        runs.push(performance.now() - start);
      }

      const sorted = runs.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const throughput = Math.round(size / (median / 1000));

      console.log(
        `📊 ${String(size).padStart(6)} candles: ` +
        `median=${median.toFixed(1)}ms  ` +
        `throughput=${throughput.toLocaleString()} candles/sec  ` +
        `runs=[${runs.map(r => r.toFixed(1)).join(', ')}]`
      );

      // Performance budgets
      if (size <= 100) expect(median).toBeLessThan(50);
      if (size === 1000) expect(median).toBeLessThan(100);
      if (size === 5000) expect(median).toBeLessThan(500);
      if (size === 10000) expect(median).toBeLessThan(1000);
    }, 30000);
  }

  it('throughput scales linearly (no quadratic blowup)', () => {
    const small = generateKlines(1000);
    const large = generateKlines(5000);

    // Warmup
    calculateAllIndicators(small);
    calculateAllIndicators(large);

    // Measure
    const startSmall = performance.now();
    calculateAllIndicators(small);
    const timeSmall = performance.now() - startSmall;

    const startLarge = performance.now();
    calculateAllIndicators(large);
    const timeLarge = performance.now() - startLarge;

    // 5x data should take at most ~8x time (allowing wiggle room for cache effects)
    const ratio = timeLarge / timeSmall;
    console.log(`📈 Scaling: 1k=${timeSmall.toFixed(1)}ms, 5k=${timeLarge.toFixed(1)}ms, ratio=${ratio.toFixed(2)}x (expect <8x)`);
    expect(ratio).toBeLessThan(8);
  }, 30000);
});
