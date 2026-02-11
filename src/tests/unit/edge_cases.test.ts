/*
 * Copyright (C) 2026 MYDCT
 *
 * Edge Case Tests for Indicator Calculations
 * Tests boundary conditions, degenerate input, and robustness.
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { calculateAllIndicators, getEmptyData } from '../../utils/technicalsCalculator';
import type { Kline } from '../../services/technicalsTypes';

function makeKline(open: number, high: number, low: number, close: number, volume: number, time: number): Kline {
  return {
    open: new Decimal(open),
    high: new Decimal(high),
    low: new Decimal(low),
    close: new Decimal(close),
    volume: new Decimal(volume),
    time,
  };
}

function makeKlines(prices: number[], opts?: { volume?: number }): Kline[] {
  const vol = opts?.volume ?? 1000;
  const baseTime = Date.now() - prices.length * 60000;
  return prices.map((p, i) =>
    makeKline(p - 0.5, p + 0.5, p - 1, p, vol, baseTime + i * 60000)
  );
}

describe('Edge Case Tests', () => {
  describe('Empty and minimal data', () => {
    it('handles 0 candles without crash', () => {
      const result = calculateAllIndicators([]);
      expect(result).toBeDefined();
      expect(result.movingAverages).toEqual([]);
      expect(result.oscillators).toEqual([]);
    });

    it('handles 1 candle without crash', () => {
      const klines = [makeKline(100, 101, 99, 100, 1000, Date.now())];
      const result = calculateAllIndicators(klines);
      expect(result).toBeDefined();
      // Should return empty data (< 2 candles check in calculateAllIndicators)
      expect(result.summary).toBeDefined();
    });

    it('handles 2 candles gracefully', () => {
      const klines = makeKlines([100, 101]);
      const result = calculateAllIndicators(klines);
      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
    });
  });

  describe('Less data than indicator period', () => {
    it('handles 5 candles with default SMA(20) without crash', () => {
      const klines = makeKlines([100, 101, 102, 103, 104]);
      const result = calculateAllIndicators(klines);
      expect(result).toBeDefined();
      // MAs may be empty or 0 — just shouldn't crash
      expect(result.summary).toBeDefined();
    });

    it('handles 10 candles with RSI(14) without crash', () => {
      const klines = makeKlines([100, 101, 99, 102, 98, 103, 97, 104, 96, 105]);
      const result = calculateAllIndicators(klines);
      expect(result).toBeDefined();
    });
  });

  describe('Flat / constant price', () => {
    it('handles all-same-price data', () => {
      const flat = new Array(100).fill(100);
      const klines = flat.map((p, i) =>
        makeKline(p, p, p, p, 1000, Date.now() - (100 - i) * 60000)
      );
      const result = calculateAllIndicators(klines);
      expect(result).toBeDefined();

      // ATR should be 0 or very close for flat price
      if (result.volatility?.atr !== undefined) {
        expect(result.volatility.atr).toBeCloseTo(0, 5);
      }

      // BB width should be 0 for flat price
      if (result.volatility?.bb) {
        const bbWidth = result.volatility.bb.upper - result.volatility.bb.lower;
        expect(bbWidth).toBeCloseTo(0, 5);
      }
    });
  });

  describe('Extreme values', () => {
    it('handles very large prices without Infinity', () => {
      const prices = new Array(100).fill(0).map((_, i) => 1e10 + i * 1000);
      const klines = makeKlines(prices);
      const result = calculateAllIndicators(klines);
      expect(result).toBeDefined();

      // No Infinity in MAs
      for (const ma of result.movingAverages) {
        expect(isFinite(ma.value)).toBe(true);
      }
    });

    it('handles very small prices without underflow', () => {
      const prices = new Array(100).fill(0).map((_, i) => 0.000001 + i * 0.0000001);
      const klines = makeKlines(prices);
      const result = calculateAllIndicators(klines);
      expect(result).toBeDefined();

      for (const ma of result.movingAverages) {
        expect(isFinite(ma.value)).toBe(true);
      }
    });
  });

  describe('Volume edge cases', () => {
    it('handles zero volume', () => {
      const klines = makeKlines(
        new Array(50).fill(0).map((_, i) => 100 + Math.sin(i)),
        { volume: 0 }
      );
      const result = calculateAllIndicators(klines);
      expect(result).toBeDefined();
    });

    it('handles very large volume', () => {
      const klines = makeKlines(
        new Array(50).fill(0).map((_, i) => 100 + Math.sin(i)),
        { volume: 1e15 }
      );
      const result = calculateAllIndicators(klines);
      expect(result).toBeDefined();

      for (const ma of result.movingAverages) {
        expect(isFinite(ma.value)).toBe(true);
      }
    });
  });

  describe('Result structure integrity', () => {
    it('returns valid TechnicalsData structure for normal data', () => {
      const prices = new Array(200).fill(0).map((_, i) => 100 + Math.sin(i / 5) * 10);
      const klines = makeKlines(prices);
      const result = calculateAllIndicators(klines);

      // Required fields
      expect(result.movingAverages).toBeDefined();
      expect(result.oscillators).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(Array.isArray(result.movingAverages)).toBe(true);
      expect(Array.isArray(result.oscillators)).toBe(true);

      // Summary structure
      expect(result.summary).toHaveProperty('buy');
      expect(result.summary).toHaveProperty('sell');
      expect(result.summary).toHaveProperty('neutral');
      expect(result.summary).toHaveProperty('action');
    });

    it('MA values contain name, value, and action', () => {
      const prices = new Array(200).fill(0).map((_, i) => 100 + Math.sin(i / 5) * 10);
      const klines = makeKlines(prices);
      const result = calculateAllIndicators(klines);

      for (const ma of result.movingAverages) {
        expect(ma).toHaveProperty('name');
        expect(ma).toHaveProperty('value');
        expect(typeof ma.name).toBe('string');
        expect(typeof ma.value).toBe('number');
      }
    });
  });
});
