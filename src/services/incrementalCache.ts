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
 * Incremental Cache for Technical Indicators
 * Only recalculates new candles instead of full dataset
 */

import type { TechnicalsData, Kline } from './technicalsTypes';
import type { IndicatorSettings } from '../types/indicators';

/**
 * Incremental cache entry
 * Stores partial results + metadata for incremental updates
 */
interface IncrementalCacheEntry {
  // Full result (for cache hit)
  result: TechnicalsData;
  
  // Metadata for incremental updates
  lastTimestamp: number;     // Last candle timestamp
  candleCount: number;        // Number of candles in calculation
  firstTimestamp: number;     // First candle timestamp
  settingsHash: string;       // Hash of indicator settings
  enabledHash: string;        // Hash of enabled indicators
  
  // Cache management
  timestamp: number;          // Entry creation time
  lastAccessed: number;       // Last access time (LRU)
  hitCount: number;           // Number of cache hits
}

/**
 * Incremental Cache Manager
 * Provides smart caching with incremental updates
 */
export class IncrementalCache {
  private cache = new Map<string, IncrementalCacheEntry>();
  private maxSize: number;
  private ttl: number;
  
  constructor(maxSize = 100, ttlMs = 60000) {
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }
  
  /**
   * Generate cache key from symbol and timeframe
   */
  private getCacheKey(symbol: string, timeframe: string): string {
    return `${symbol}:${timeframe}`;
  }
  
  /**
   * Generate hash from settings
   */
  private hashSettings(settings: IndicatorSettings): string {
    // Simple hash - stringify and hash relevant fields
    const relevant = {
      ema: settings.ema,
      rsi: settings.rsi,
      macd: settings.macd,
      bb: settings.bb,
      stochastic: settings.stochastic,
      stochRsi: settings.stochRsi,
      // Add other indicators as needed
    };
    
    return JSON.stringify(relevant);
  }
  
  /**
   * Generate hash from enabled indicators
   */
  private hashEnabled(enabled: Partial<Record<string, boolean>>): string {
    return JSON.stringify(enabled || {});
  }
  
  /**
   * Check if cache entry can be used for incremental update
   */
  canUseIncremental(
    symbol: string,
    timeframe: string,
    klines: Kline[],
    settings: IndicatorSettings,
    enabled: Partial<Record<string, boolean>>
  ): {
    canUse: boolean;
    entry?: IncrementalCacheEntry;
    newCandles: number;
  } {
    const key = this.getCacheKey(symbol, timeframe);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return { canUse: false, newCandles: klines.length };
    }
    
    // Check if settings/enabled changed
    const settingsHash = this.hashSettings(settings);
    const enabledHash = this.hashEnabled(enabled);
    
    if (entry.settingsHash !== settingsHash || entry.enabledHash !== enabledHash) {
      return { canUse: false, newCandles: klines.length };
    }
    
    // Check if klines are contiguouscheck (first candle matches)
    if (klines.length > 0 && klines[0].time !== entry.firstTimestamp) {
      // Dataset changed completely (e.g., timeframe switch)
      return { canUse: false, newCandles: klines.length };
    }
    
    // Count new candles
    const lastCachedTime = entry.lastTimestamp;
    const newCandleCount = klines.filter(k => k.time > lastCachedTime).length;
    
    // Can use incremental if:
    // 1. We have some cached candles
    // 2. Not too many new candles (>20% means full recalc is better)
    const threshold = Math.max(10, entry.candleCount * 0.2);
    const canUse = newCandleCount > 0 && newCandleCount < threshold;
    
    return { canUse, entry, newCandles: newCandleCount };
  }
  
  private accessCounter = 0;

  /**
   * Store result in cache
   */
  set(
    symbol: string,
    timeframe: string,
    klines: Kline[],
    settings: IndicatorSettings,
    enabled: Partial<Record<string, boolean>>,
    result: TechnicalsData
  ): void {
    const key = this.getCacheKey(symbol, timeframe);
    
    const entry: IncrementalCacheEntry = {
      result,
      lastTimestamp: klines[klines.length - 1]?.time || 0,
      candleCount: klines.length,
      firstTimestamp: klines[0]?.time || 0,
      settingsHash: this.hashSettings(settings),
      enabledHash: this.hashEnabled(enabled),
      timestamp: Date.now(),
      lastAccessed: ++this.accessCounter,
      hitCount: 0
    };
    
    this.cache.set(key, entry);
    
    // Evict if over size
    this.evictIfNeeded();
  }
  
  /**
   * Get cached result (full cache hit)
   */
  get(
    symbol: string,
    timeframe: string,
    lastTimestamp: number
  ): TechnicalsData | null {
    const key = this.getCacheKey(symbol, timeframe);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if still valid
    if (entry.lastTimestamp !== lastTimestamp) {
      return null; // New data available
    }
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    // Update access stats
    entry.lastAccessed = ++this.accessCounter;
    entry.hitCount++;
    
    return entry.result;
  }
  
  /**
   * Evict least recently used entries if over max size
   */
  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxSize) return;
    
    // Find LRU entry
    let lruKey: string | null = null;
    let lruTime = Infinity;
    
    this.cache.forEach((entry, key) => {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    });
    
    if (lruKey) {
      this.cache.delete(lruKey);
      
      if (import.meta.env.DEV) {
        console.log(`[IncrementalCache] Evicted LRU entry: ${lruKey}`);
      }
    }
  }
  
  /**
   * Clean up stale entries (TTL expired)
   */
  cleanup(): void {
    const now = Date.now();
    const staleKeys: string[] = [];
    
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > this.ttl) {
        staleKeys.push(key);
      }
    });
    
    staleKeys.forEach(key => this.cache.delete(key));
    
    if (import.meta.env.DEV && staleKeys.length > 0) {
      console.log(`[IncrementalCache] Cleaned up ${staleKeys.length} stale entries`);
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats() {
    let totalHits = 0;
    let avgHitCount = 0;
    
    this.cache.forEach(entry => {
      totalHits += entry.hitCount;
    });
    
    if (this.cache.size > 0) {
      avgHitCount = totalHits / this.cache.size;
    }
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      totalHits,
      avgHitCount: avgHitCount.toFixed(2),
      ttl: this.ttl
    };
  }
  
  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Update cache configuration
   */
  updateConfig(maxSize: number, ttlMs: number): void {
    this.maxSize = maxSize;
    this.ttl = ttlMs;
    
    // Evict if needed after size change
    this.evictIfNeeded();
  }
}

// Singleton instance
export const incrementalCache = new IncrementalCache();
