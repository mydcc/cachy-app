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
 * Unit Tests for Incremental Cache
 * Tests smart caching with partial updates
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IncrementalCache } from '../services/incrementalCache';
import type { TechnicalsData, Kline } from '../services/technicalsTypes';
import type { IndicatorSettings } from '../stores/indicator.svelte';

// Mock data generators
function generateKlines(count: number, startTime = 1000000): Kline[] {
  return Array.from({ length: count }, (_, i) => ({
    time: startTime + i * 60000, // 1min intervals
    open: 100 + Math.random() * 10,
    high: 105 + Math.random() * 10,
    low: 95 + Math.random() * 10,
    close: 100 + Math.random() * 10,
    volume: 1000 + Math.random() * 500
  }));
}

function generateMockResult(): TechnicalsData {
  return {
    oscillators: [],
    movingAverages: [],
    pivots: { classic: { r3: 0, r2: 0, r1: 0, p: 0, s1: 0, s2: 0, s3: 0 } },
    summary: { buy: 0, sell: 0, neutral: 0, action: 'Neutral' },
    lastUpdated: Date.now()
  } as TechnicalsData;
}

const mockSettings: IndicatorSettings = {
  ema: { enabled: true, lengths: [9, 21], source: 'close' },
  rsi: { enabled: true, length: 14, source: 'close', overbought: 70, oversold: 30 },
  historyLimit: 750
} as any;

describe('IncrementalCache', () => {
  let cache: IncrementalCache;
  
  beforeEach(() => {
    cache = new IncrementalCache(100, 60000); // 100 entries, 60s TTL
  });
  
  describe('Basic Caching', () => {
    it('should store and retrieve results', () => {
      const klines = generateKlines(100);
      const result = generateMockResult();
      
      cache.set('BTCUSDT', '1m', klines, mockSettings, {}, result);
      
      const retrieved = cache.get('BTCUSDT', '1m', klines[klines.length - 1].time);
      
      expect(retrieved).toEqual(result);
    });
    
    it('should return null for cache miss', () => {
      const retrieved = cache.get('ETHUSDT', '1m', 123456789);
      expect(retrieved).toBeNull();
    });
    
    it('should invalidate when timestamp changes', () => {
      const klines = generateKlines(100);
      const result = generateMockResult();
      
      cache.set('BTCUSDT', '1m', klines, mockSettings, {}, result);
      
      // Try to get with different timestamp
      const retrieved = cache.get('BTCUSDT', '1m', 999999999);
      
      expect(retrieved).toBeNull();
    });
  });
  
  describe('Incremental Updates', () => {
    it('should detect when incremental update is possible', () => {
      const klines = generateKlines(100, 1000000);
      const result = generateMockResult();
      
      cache.set('BTCUSDT', '1m', klines, mockSettings, {}, result);
      
      // Add 5 new candles (same start, extended end)
      const newKlines = generateKlines(105, 1000000);
      
      const check = cache.canUseIncremental('BTCUSDT', '1m', newKlines, mockSettings, {});
      
      expect(check.canUse).toBe(true);
      expect(check.newCandles).toBe(5);
    });
    
    it('should NOT use incremental for too many new candles', () => {
      const klines = generateKlines(100, 1000000);
      const result = generateMockResult();
      
      cache.set('BTCUSDT', '1m', klines, mockSettings, {}, result);
      
      // Add 30 new candles (>20% threshold)
      const newKlines = generateKlines(130, 1000000);
      
      const check = cache.canUseIncremental('BTCUSDT', '1m', newKlines, mockSettings, {});
      
      expect(check.canUse).toBe(false);
    });
    
    it('should invalidate on settings change', () => {
      const klines = generateKlines(100);
      const result = generateMockResult();
      
      cache.set('BTCUSDT', '1m', klines, mockSettings, {}, result);
      
      // Change settings
      const newSettings = { ...mockSettings, rsi: { ...mockSettings.rsi, length: 21 } };
      
      const check = cache.canUseIncremental('BTCUSDT', '1m', klines, newSettings, {});
      
      expect(check.canUse).toBe(false);
    });
    
    it('should invalidate on enabled indicators change', () => {
      const klines = generateKlines(100);
      const result = generateMockResult();
      
      cache.set('BTCUSDT', '1m', klines, mockSettings, { ema: true }, result);
      
      // Change enabled
      const check = cache.canUseIncremental('BTCUSDT', '1m', klines, mockSettings, { ema: true, rsi: true });
      
      expect(check.canUse).toBe(false);
    });
  });
  
  describe('LRU Eviction', () => {
    it('should evict least recently used entry when over max size', () => {
      const smallCache = new IncrementalCache(3, 60000); // Max 3 entries
      
      const klines1 = generateKlines(10, 1000000);
      const klines2 = generateKlines(10, 2000000);
      const klines3 = generateKlines(10, 3000000);
      const klines4 = generateKlines(10, 4000000);
      
      smallCache.set('SYM1', '1m', klines1, mockSettings, {}, generateMockResult());
      smallCache.set('SYM2', '1m', klines2, mockSettings, {}, generateMockResult());
      smallCache.set('SYM3', '1m', klines3, mockSettings, {}, generateMockResult());
      
      // Access SYM1 and SYM3 to keep them alive
      smallCache.get('SYM1', '1m', klines1[klines1.length - 1].time);
      smallCache.get('SYM3', '1m', klines3[klines3.length - 1].time);
      
      // Add 4th entry - should evict SYM2 (least recently used)
      smallCache.set('SYM4', '1m', klines4, mockSettings, {}, generateMockResult());
      
      const stats = smallCache.getStats();
      expect(stats.size).toBe(3); // Max size enforced
      
      // SYM2 should be evicted
      const sym2Result = smallCache.get('SYM2', '1m', klines2[klines2.length - 1].time);
      expect(sym2Result).toBeNull();
    });
  });
  
  describe('TTL Cleanup', () => {
    it('should remove expired entries', async () => {
      const shortCache = new IncrementalCache(100, 100); // 100ms TTL
      
      const klines = generateKlines(10);
      shortCache.set('BTCUSDT', '1m', klines, mockSettings, {}, generateMockResult());
      
      // Wait for TTL expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      shortCache.cleanup();
      
      const stats = shortCache.getStats();
      expect(stats.size).toBe(0);
    });
  });
  
  describe('Statistics', () => {
    it('should track hit counts', () => {
      const klines = generateKlines(100);
      const result = generateMockResult();
      
      cache.set('BTCUSDT', '1m', klines, mockSettings, {}, result);
      
      // Hit cache 3 times
      cache.get('BTCUSDT', '1m', klines[klines.length - 1].time);
      cache.get('BTCUSDT', '1m', klines[klines.length - 1].time);
      cache.get('BTCUSDT', '1m', klines[klines.length - 1].time);
      
      const stats = cache.getStats();
      
      expect(stats.totalHits).toBe(3);
      expect(stats.size).toBe(1);
    });
  });
});
