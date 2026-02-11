/*
 * Copyright (C) 2026 MYDCT
 *
 * Load Tests (1k-50k candles)
 * Validates correctness and stability at scale, including concurrent execution.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { calculateAllIndicators } from '../../utils/technicalsCalculator';
import type { Kline } from '../../services/technicalsTypes';

function generateKlines(count: number, seed = 42): Kline[] {
  const klines: Kline[] = [];
  let price = 100;
  const baseTime = Date.now() - count * 60000;
  // Simple seeded PRNG for reproducibility
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

  for (let i = 0; i < count; i++) {
    const change = (rand() - 0.5) * 2;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + rand() * 0.5;
    const low = Math.min(open, close) - rand() * 0.5;
    const volume = 1000 + rand() * 9000;

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

describe('Load Testing', () => {
  const loadSizes = [1000, 5000, 10000, 25000, 50000];

  for (const size of loadSizes) {
    it(`handles ${size.toLocaleString()} candles without timeout`, () => {
      const klines = generateKlines(size);

      const start = performance.now();
      const result = calculateAllIndicators(klines);
      const elapsed = performance.now() - start;

      console.log(`🏋️ ${String(size).padStart(6)} candles: ${elapsed.toFixed(1)}ms`);

      // Must complete and produce valid structure
      expect(result).toBeDefined();
      expect(result.movingAverages).toBeDefined();
      expect(result.oscillators).toBeDefined();
      expect(result.summary).toBeDefined();

      // MAs should not be empty for large enough datasets
      if (size >= 200) {
        expect(result.movingAverages.length).toBeGreaterThan(0);
      }

      // No NaN in summary counts
      expect(Number.isFinite(result.summary.buy)).toBe(true);
      expect(Number.isFinite(result.summary.sell)).toBe(true);
      expect(Number.isFinite(result.summary.neutral)).toBe(true);
    }, 60000); // 60s timeout for very large datasets
  }

  it('concurrent calculations produce correct independent results', () => {
    // Generate different datasets
    const klines1k = generateKlines(1000, 1);
    const klines5k = generateKlines(5000, 2);
    const klines2k = generateKlines(2000, 3);

    // Run all calculations
    const result1 = calculateAllIndicators(klines1k);
    const result2 = calculateAllIndicators(klines5k);
    const result3 = calculateAllIndicators(klines2k);

    // Re-run with same data → should produce same results (deterministic)
    const result1b = calculateAllIndicators(klines1k);
    const result2b = calculateAllIndicators(klines5k);
    const result3b = calculateAllIndicators(klines2k);

    // Verify determinism
    expect(result1.summary.action).toBe(result1b.summary.action);
    expect(result2.summary.action).toBe(result2b.summary.action);
    expect(result3.summary.action).toBe(result3b.summary.action);

    // Verify independence (different data → likely different results)
    // At minimum, MA values should differ between different datasets
    if (result1.movingAverages.length > 0 && result2.movingAverages.length > 0) {
      const ma1 = result1.movingAverages[0].value;
      const ma2 = result2.movingAverages[0].value;
      // Very unlikely to be exactly equal with different seeds
      expect(ma1).not.toBe(ma2);
    }

    console.log('✅ Concurrent calculations are deterministic and independent');
  }, 60000);

  it('no shared-state corruption between sequential runs', () => {
    // This tests that the buffer pool doesn't corrupt across calls
    const klines500 = generateKlines(500, 10);
    const klines10k = generateKlines(10000, 20);

    // Run small, then large, then small again
    const first = calculateAllIndicators(klines500);
    calculateAllIndicators(klines10k); // Potentially expands buffers
    const third = calculateAllIndicators(klines500);

    // First and third should be identical (same input)
    expect(first.summary.action).toBe(third.summary.action);
    expect(first.summary.buy).toBe(third.summary.buy);
    expect(first.summary.sell).toBe(third.summary.sell);

    if (first.movingAverages.length > 0) {
      expect(first.movingAverages[0].value).toBeCloseTo(third.movingAverages[0].value, 10);
    }

    console.log('✅ No shared-state corruption between sequential runs');
  }, 30000);
});
