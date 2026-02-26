/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Decimal } from "decimal.js";
import { browser } from "$app/environment";
import { untrack } from "svelte";
import { settingsState } from "./settings.svelte";
import { BufferPool } from "../utils/bufferPool";
import { scheduler } from "../utils/scheduler";
import { idleMonitor } from "../utils/idleMonitor.svelte";

import type { Kline, KlineBuffers } from "../services/technicalsTypes";

export interface MarketData {
  symbol: string;
  lastPrice: Decimal | null;
  indexPrice: Decimal | null;
  fundingRate: Decimal | null;
  nextFundingTime: number | null; // Unix timestamp in ms
  depth?: {
    bids: [string, string][]; // [price, qty]
    asks: [string, string][];
  };
  highPrice?: Decimal | null;
  lowPrice?: Decimal | null;
  volume?: Decimal | null;
  quoteVolume?: Decimal | null;
  priceChangePercent?: Decimal | null;
  klines: Record<string, Kline[]>;
  klinesBuffers?: Record<string, KlineBuffers>; // SoA Buffers for performance
  technicals?: Record<string, import("../services/technicalsTypes").TechnicalsData>;
  lastUpdated?: number; // Optimization: only snapshot fresh data
}

// Permissive update type for WebSocket data (allows strings/numbers for Decimals)
export type MarketUpdatePayload = {
  [K in keyof MarketData]?: MarketData[K] | string | number | null;
};

export type WSStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "reconnecting";

// LRU Cache Configuration
// Configurable via settingsState.marketCacheSize (default: 20)
// Increased cache improves performance for power users tracking many symbols
const DEFAULT_CACHE_SIZE = 20;
const TTL_MS = 5 * 60 * 1000; // 5 minutes
const KLINE_BUFFER_HARD_LIMIT = 2000; // Hard cap for pending kline updates

function getMaxCacheSize(): number {
  return settingsState.marketCacheSize || DEFAULT_CACHE_SIZE;
}

interface CacheMetadata {
  lastAccessed: number;
  createdAt: number;
}

export class MarketManager {
  data = $state<Record<string, MarketData>>({});
  connectionStatus = $state<WSStatus>("disconnected");

  // Telemetry Metrics
  telemetry = $state({
    apiLatency: 0,
    wsLatency: 0,
    activeConnections: 0,
    apiCallsLastMinute: 0,
    lastCalcDuration: 0,
    cacheHitRate: 100
  });

  private cacheMetadata = new Map<string, CacheMetadata>();
  private pendingUpdates = new Map<string, MarketUpdatePayload>();
  // Buffer for raw kline updates: Key = `${symbol}:${timeframe}`
  private backingBuffers = new Map<string, KlineBuffers>();
  private pendingKlineUpdates = new Map<string, any[]>();
  private bufferPool = new BufferPool();
  private cleanupIntervalId: any = null;
  private flushIntervalId: any = null;
  private lastFlushTime = 0;
  private telemetryIntervalId: any = null;
  private notifyTimer: any = null;
  private statusNotifyTimer: any = null;
  private flushErrorCount = 0; // Circuit breaker for flush loops

  constructor() {
    if (browser) {
      this.cleanupIntervalId = setInterval(() => {
        this.cleanup();
      }, 30 * 1000); // Check every 30s

      // Batch flushing loop (4 FPS for better CPU efficiency)
      // Batch flushing loop (RAF-based for better idle performance)
      this.startFlushLoop();

      // Reset API calls counter every minute
      this.telemetryIntervalId = setInterval(() => {
        this.telemetry.apiCallsLastMinute = 0;
      }, 60000);
    }
  }

  /**
   * Cleanup method for HMR and proper disposal
   * Clears all intervals to prevent memory leaks
   */
  destroy() {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    if (this.flushIntervalId) {
      cancelAnimationFrame(this.flushIntervalId);
      this.flushIntervalId = null;
    }
    if (this.telemetryIntervalId) {
      clearInterval(this.telemetryIntervalId);
      this.telemetryIntervalId = null;
    }
    this.cacheMetadata.clear();
    this.pendingUpdates.clear();
    this.backingBuffers.clear();
    this.data = {};
  }

  private getOrCreateSymbol(symbol: string): MarketData {
    if (!this.data[symbol]) {
      this.data[symbol] = {
        symbol,
        lastPrice: null,
        indexPrice: null,
        fundingRate: null,
        nextFundingTime: null,
        klines: {},
        klinesBuffers: {},
      };
    }
    return this.data[symbol];
  }

  // Helper: Touch symbol to update LRU
  private touchSymbol(symbol: string) {
    const now = Date.now();
    const existing = this.cacheMetadata.get(symbol);
    this.cacheMetadata.set(symbol, {
      lastAccessed: now,
      createdAt: existing?.createdAt || now,
    });
  }

  // Helper: Evict LRU symbol
  private evictLRU(): string | null {
    if (this.cacheMetadata.size === 0) return null;

    let oldest: string | null = null;
    let oldestTime = Infinity;

    this.cacheMetadata.forEach((meta, symbol) => {
      if (meta.lastAccessed < oldestTime) {
        oldestTime = meta.lastAccessed;
        oldest = symbol;
      }
    });

    if (oldest) {
      this.cacheMetadata.delete(oldest);
      return oldest;
    }
    return null;
  }

  /** Release all backing buffers for a given symbol back to the pool */
  private releaseSymbolBackingBuffers(symbol: string) {
    const keysToDelete: string[] = [];
    const prefix = `${symbol}:`;
    this.backingBuffers.forEach((backing, key) => {
      if (key.startsWith(prefix)) {
        this.bufferPool.release(backing.times);
        this.bufferPool.release(backing.opens);
        this.bufferPool.release(backing.highs);
        this.bufferPool.release(backing.lows);
        this.bufferPool.release(backing.closes);
        this.bufferPool.release(backing.volumes);
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      this.backingBuffers.delete(key);
    }
  }

  private enforceCacheLimit() {
    // Dynamically respect settingsState.marketCacheSize
    const maxSize = getMaxCacheSize();
    while (Object.keys(this.data).length > maxSize) {
      const toEvict = this.evictLRU();
      if (!toEvict) {
        // Fallback: If metadata is out of sync, delete arbitrary key
        const key = Object.keys(this.data)[0];
        if (key) {
          this.releaseSymbolBackingBuffers(key);
          delete this.data[key];
        }
        break;
      }
      this.releaseSymbolBackingBuffers(toEvict);
      delete this.data[toEvict];
    }
  }

  updateSymbol(symbol: string, partial: MarketUpdatePayload) {
    // Instead of updating immediately, we buffer updates
    const existing = this.pendingUpdates.get(symbol) || {};

    // Merge partials manually to ensure nested objects like depth/technicals don't get lost if partial is shallow
    // However, partial is flat except for depth/technicals/klines.
    // Simple spread is efficient for gathering updates.
    this.pendingUpdates.set(symbol, { ...existing, ...partial });

    // Safety: Prevent memory leak if flush interval stalls
    // Dynamic limit based on cache size (5x cache size to allow for burst)
    const limit = (settingsState.marketCacheSize || 20) * 5;
    if (this.pendingUpdates.size > limit) {
      if (import.meta.env.DEV) {
        console.warn(`[Market] Flush buffer overflow (${this.pendingUpdates.size} > ${limit}), forcing flush.`);
      }
      this.flushUpdates();
    }

    // Note: We do NOT touch LRU here to save CPU. LRU touch will happen on flush.
  }

  private flushUpdates() {
    
    if (this.pendingUpdates.size === 0 && this.pendingKlineUpdates.size === 0) return;

    untrack(() => {
      // 1. Apply Market Data Updates (Price, Ticker, etc.)
      if (this.pendingUpdates.size > 0) {
        this.pendingUpdates.forEach((partial, symbol) => {
          try {
            this.applyUpdate(symbol, partial);
          } catch (e) {
            this.flushErrorCount++;
            if (import.meta.env.DEV) console.error(`[Market] Error flushing update for ${symbol}`, e);
          }
        });
        this.pendingUpdates.clear();
      }

      // 2. Apply Kline Updates
      if (this.pendingKlineUpdates.size > 0) {
        this.pendingKlineUpdates.forEach((rawKlines, key) => {
          const [symbol, timeframe] = key.split(":");
          if (symbol && timeframe) {
            try {
              // Process the batch
              this.applySymbolKlines(symbol, timeframe, rawKlines, "ws", true);
            } catch (e) {
              this.flushErrorCount++;
              if (import.meta.env.DEV) console.error(`[Market] Error flushing klines for ${key}`, e);
            }
          }
        });
        this.pendingKlineUpdates.clear();
      }
    });

    // FAIL-SAFE: If errors persist, reset state to prevent leak
    if (this.flushErrorCount > 10) {
        if (import.meta.env.DEV) console.error("[Market] Critical: Flush error threshold reached. Clearing all pending updates.");
        this.pendingUpdates.clear();
        this.pendingKlineUpdates.clear();
        this.flushErrorCount = 0;
    } else if (this.flushErrorCount > 0) {
        // Decay error count
        this.flushErrorCount--;
    }

    this.enforceCacheLimit();
  }

  private applyUpdate(symbol: string, partial: any) {
    try {
      this.touchSymbol(symbol);
      const current = this.getOrCreateSymbol(symbol);
      const previousTimestamp = current.lastUpdated || 0;
      current.lastUpdated = Date.now();

      // Optimization: Check for equality before creating new Decimal
      // Re-use Decimal instances if string value hasn't changed.
      const toDecimal = (val: any, currentVal: Decimal | null | undefined): Decimal | undefined | null => {
        try {
          if (val === undefined) return undefined;

          // HARDENING: Warn on explicit nulls for critical data, but allow if intended
          if (val === null) return null;

          // HARDENING: Reject NaN strictly
          if (typeof val === 'number' && isNaN(val)) {
              // if (import.meta.env.DEV) console.warn("[Market] Rejected NaN value in update");
              return undefined;
          }

          // Fast check: If it's the exact same object, return it.
          if (currentVal === val) return currentVal;

          const valStr = String(val);
          // Optimization: .toString() on Decimal is fast (cached).
          if (currentVal && currentVal.toString() === valStr) {
             return currentVal; // Reuse existing object
          }
          return new Decimal(val);
        } catch (e) {
          return undefined;
        }
      };

      if (partial.lastPrice !== undefined) {
          const newVal = toDecimal(partial.lastPrice, current.lastPrice);
          if (newVal !== undefined) {
              if (newVal === null && import.meta.env.DEV) {
                  console.warn(`[Market] Received null lastPrice for ${symbol}`);
              }
              current.lastPrice = newVal;
          }
      }
      if (partial.indexPrice !== undefined) {
          const newVal = toDecimal(partial.indexPrice, current.indexPrice);
          if (newVal !== undefined) current.indexPrice = newVal;
      }
      if (partial.highPrice !== undefined) {
          const newVal = toDecimal(partial.highPrice, current.highPrice);
          if (newVal !== undefined) current.highPrice = newVal;
      }
      if (partial.lowPrice !== undefined) {
          const newVal = toDecimal(partial.lowPrice, current.lowPrice);
          if (newVal !== undefined) current.lowPrice = newVal;
      }
      if (partial.volume !== undefined) {
          const newVal = toDecimal(partial.volume, current.volume);
          if (newVal !== undefined) current.volume = newVal;
      }
      if (partial.quoteVolume !== undefined) {
          const newVal = toDecimal(partial.quoteVolume, current.quoteVolume);
          if (newVal !== undefined) current.quoteVolume = newVal;
      }
      if (partial.priceChangePercent !== undefined) {
          const newVal = toDecimal(partial.priceChangePercent, current.priceChangePercent);
          if (newVal !== undefined) current.priceChangePercent = newVal;
      }
      if (partial.fundingRate !== undefined) {
          const newVal = toDecimal(partial.fundingRate, current.fundingRate);
          if (newVal !== undefined) current.fundingRate = newVal;
      }

      if (partial.nextFundingTime !== undefined && partial.nextFundingTime !== null) {
        let nft: number = 0;
        const raw = partial.nextFundingTime;

        if (typeof raw === "number") {
          nft = raw;
        } else if (typeof raw === "string") {
          if (/^\d+$/.test(raw)) {
            nft = parseInt(raw, 10);
          } else {
            // Falls es ein ISO-String oder ein anderes Datumsformat ist
            const parsed = new Date(raw).getTime();
            if (!isNaN(parsed)) {
              nft = parsed;
            }
          }
        }

        // Heuristik: Sekunden in Millisekunden umrechnen (~1.7*10^9 vs ~1.7*10^12)
        if (nft > 0 && nft < 10000000000) {
          nft *= 1000;
        }
        current.nextFundingTime = nft > 0 ? nft : null;
      }

      if (partial.depth !== undefined) current.depth = partial.depth;
      if (partial.technicals !== undefined) {
        // Merge technicals map (keyed by timeframe)
        current.technicals = { ...(current.technicals || {}), ...partial.technicals };
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error(`[Market] Critical error applying update for ${symbol}`, e);
      }
    }
  }

  updateTelemetry(partial: Partial<typeof this.telemetry>) {
    this.telemetry = { ...this.telemetry, ...partial };
  }

  recordApiCall() {
    this.telemetry.apiCallsLastMinute++;
  }

  updateSymbolKlines(
    symbol: string,
    timeframe: string,
    klines: any[],
    source: "rest" | "ws" = "rest",
    enforceLimit: boolean = true
  ) {
    if (source === "ws") {
      // Buffer high-frequency WS updates
      const key = `${symbol}:${timeframe}`;
      let pending = this.pendingKlineUpdates.get(key);

      // Hardening: Prevent individual buffer from growing indefinitely (OOM protection)
      if (pending && pending.length >= KLINE_BUFFER_HARD_LIMIT) {
          if (import.meta.env.DEV) console.warn(`[Market] Buffer overflow for ${key} (${pending.length}), forcing flush.`);
          this.flushUpdates();
          pending = undefined; // Force refresh after flush
      }

      if (!pending) {
          pending = [];
          this.pendingKlineUpdates.set(key, pending);
      }

      // Optimization: Just append. Logic to merge is handled in flush.
      // This saves Decimal creation and merge logic overhead for rapidly overwritten candles.
      for (const k of klines) pending.push(k);

      // Safety check: force flush if too many SYMBOLS are pending updates
      // Klines need more buffer space (10x cache size)
      const limit = (settingsState.marketCacheSize || 20) * 10;
      if (this.pendingKlineUpdates.size > limit) {
        this.flushUpdates();
      }
    } else {
      // REST updates (historical data load) should be applied immediately
      this.applySymbolKlines(symbol, timeframe, klines, source, enforceLimit);
    }
  }

  // Internal method: Applies updates (previously updateSymbolKlines)
  private applySymbolKlines(
    symbol: string,
    timeframe: string,
    klines: any[],
    source: "rest" | "ws" = "rest",
    enforceLimit: boolean = true
  ) {
    this.touchSymbol(symbol);
    const current = this.getOrCreateSymbol(symbol);

    // [OPTIMIZATION] Deduplicate raw updates
    if (klines.length > 1 && (source === "ws" || klines[0]?.open instanceof Decimal === false)) {
        klines.sort((a, b) => a.time - b.time);
        const dedupedRaw: any[] = [];
        let lastTime = -1;
        for (const k of klines) {
             if (k.time === lastTime) {
                 dedupedRaw[dedupedRaw.length - 1] = k;
             } else {
                 dedupedRaw.push(k);
                 lastTime = k.time;
             }
        }
        klines = dedupedRaw;
    }

    // [OPTIMIZATION] Fast Path for Single Tail Update (Common Case)
    // This avoids mapping, slicing, and full buffer writes for frequent price updates
    const existingHistory = current.klines[timeframe];
    if (klines.length === 1 && existingHistory && existingHistory.length > 0) {
        const lastIdx = existingHistory.length - 1;
        const lastKline = existingHistory[lastIdx];
        const newRaw = klines[0];

        if (newRaw.time === lastKline.time) {
            // 1. Update History In-Place (Minimizing Decimal Allocations)
            // We use a helper to only create new Decimals if value changed
            const updateDecimal = (oldVal: Decimal, newVal: any): Decimal => {
                if (typeof newVal === "number") {
                     return new Decimal(newVal);
                }
                if (typeof newVal === "string" && oldVal.toString() === newVal) return oldVal;
                return new Decimal(newVal);
            };

            const updatedKline: Kline = {
                open: updateDecimal(lastKline.open, newRaw.open),
                high: updateDecimal(lastKline.high, newRaw.high),
                low: updateDecimal(lastKline.low, newRaw.low),
                close: updateDecimal(lastKline.close, newRaw.close),
                volume: updateDecimal(lastKline.volume, newRaw.volume),
                time: newRaw.time
            };

            existingHistory[lastIdx] = updatedKline;

            // 2. Update Buffer Directly (Skip Decimal.toNumber() overhead)
            const bufferKey = `${symbol}:${timeframe}`;
            const backing = this.backingBuffers.get(bufferKey);
            if (backing && backing.times.length > lastIdx) {
                 const getNum = (val: any): number => {
                    if (typeof val === "number") return val;
                    if (typeof val === "string") return parseFloat(val);
                    return val instanceof Decimal ? val.toNumber() : Number(val);
                 };

                 backing.opens[lastIdx] = getNum(newRaw.open);
                 backing.highs[lastIdx] = getNum(newRaw.high);
                 backing.lows[lastIdx] = getNum(newRaw.low);
                 backing.closes[lastIdx] = getNum(newRaw.close);
                 backing.volumes[lastIdx] = getNum(newRaw.volume);
            }

            current.lastUpdated = Date.now();
            return;
        }
    }
    // Normalize
    let newKlines: Kline[] = klines.map(k => ({
      open: k.open instanceof Decimal ? k.open : new Decimal(k.open),
      high: k.high instanceof Decimal ? k.high : new Decimal(k.high),
      low: k.low instanceof Decimal ? k.low : new Decimal(k.low),
      close: k.close instanceof Decimal ? k.close : new Decimal(k.close),
      volume: k.volume instanceof Decimal ? k.volume : new Decimal(k.volume),
      time: k.time
    }));

    // Deduplicate normalized
    if (newKlines.length > 1) {
      newKlines.sort((a, b) => a.time - b.time);
      const deduped: Kline[] = [];
      let lastTime = -1;
      for (const k of newKlines) {
        if (k.time === lastTime) {
          deduped[deduped.length - 1] = k;
        } else {
          deduped.push(k);
          lastTime = k.time;
        }
      }
      newKlines = deduped;
    }
    let history = current.klines[timeframe] || [];
    if (!current.klines[timeframe]) current.klines[timeframe] = history;

    // Calculate Limit
    const userLimit = settingsState.chartHistoryLimit || 2000;
    const safetyLimit = 50000;
    let effectiveLimit = userLimit;
    if (!enforceLimit) {
      effectiveLimit = safetyLimit;
    } else {
      const previousLength = Math.max(0, history.length);
      effectiveLimit = Math.min(Math.max(previousLength, userLimit), safetyLimit);
    }

    // [MEMORY FIX] Backing Buffer Management
    const bufferKey = `${symbol}:${timeframe}`;
    let backing = this.backingBuffers.get(bufferKey);
    let offset = 0; // Where to start writing in backing buffer
    let isAppend = false;

    // Apply updates to history
    if (newKlines.length > 0) {
        if (history.length === 0) {
            newKlines.sort((a, b) => a.time - b.time);
            if (newKlines.length > effectiveLimit) newKlines = newKlines.slice(-effectiveLimit);
            history = newKlines;
            current.klines[timeframe] = history;
            // Full rebuild implies offset 0
        } else {
            newKlines.sort((a, b) => a.time - b.time);
            const lastHistTime = history[history.length - 1].time;
            const firstNewTime = newKlines[0].time;

            if (firstNewTime > lastHistTime) {
                // Append
                offset = history.length;
                history.push(...newKlines);
                isAppend = true;
            } else if (firstNewTime === lastHistTime && newKlines.length === 1) {
                // Update Tail
                offset = history.length - 1;
                history[history.length - 1] = newKlines[0];
                isAppend = true;
            } else if (firstNewTime >= lastHistTime) {
                // Overlap Append (Simplified: fall back to full rewrite for safety)
                for (const k of newKlines) {
                    if (k.time === lastHistTime) {
                        history[history.length - 1] = k;
                    } else if (k.time > lastHistTime) {
                        history.push(k);
                    }
                }
                isAppend = false;
            } else {
                // Merge/Sort/Slice
                const merged: Kline[] = [];
                let i = 0, j = 0;
                while (i < history.length && j < newKlines.length) {
                    if (history[i].time < newKlines[j].time) merged.push(history[i++]);
                    else if (history[i].time > newKlines[j].time) merged.push(newKlines[j++]);
                    else { merged.push(newKlines[j++]); i++; }
                }
                while (i < history.length) merged.push(history[i++]);
                while (j < newKlines.length) merged.push(newKlines[j++]);
                history = merged;
                current.klines[timeframe] = history;
                isAppend = false;
            }

            // Slice if needed
            if (history.length > effectiveLimit) {
                history = history.slice(-effectiveLimit);
                current.klines[timeframe] = history;
                isAppend = false; // Shifted/Sliced means we need full write
            }
        }
    }

    const neededLen = history.length;
    if (neededLen === 0) return;

    // Check Backing Buffer Capacity
    if (!backing || backing.times.length < neededLen) {
        // Allocate with 1.5x growth
        const newCap = Math.ceil(Math.max(neededLen * 1.5, 1000));

        // Release old if exists
        if (backing) {
            this.bufferPool.release(backing.times);
            this.bufferPool.release(backing.opens);
            this.bufferPool.release(backing.highs);
            this.bufferPool.release(backing.lows);
            this.bufferPool.release(backing.closes);
            this.bufferPool.release(backing.volumes);
        }

        backing = {
            times: this.bufferPool.acquire(newCap),
            opens: this.bufferPool.acquire(newCap),
            highs: this.bufferPool.acquire(newCap),
            lows: this.bufferPool.acquire(newCap),
            closes: this.bufferPool.acquire(newCap),
            volumes: this.bufferPool.acquire(newCap)
        };
        this.backingBuffers.set(bufferKey, backing);
        isAppend = false; // New buffer needs full write
    }

    // Write to Buffer
    if (isAppend) {
        // Only write the new/updated part
        for (let i = offset; i < neededLen; i++) {
            const k = history[i];
            backing.times[i] = k.time;
            backing.opens[i] = k.open.toNumber();
            backing.highs[i] = k.high.toNumber();
            backing.lows[i] = k.low.toNumber();
            backing.closes[i] = k.close.toNumber();
            backing.volumes[i] = k.volume.toNumber();
        }
    } else {
        // Full Write
        for (let i = 0; i < neededLen; i++) {
            const k = history[i];
            backing.times[i] = k.time;
            backing.opens[i] = k.open.toNumber();
            backing.highs[i] = k.high.toNumber();
            backing.lows[i] = k.low.toNumber();
            backing.closes[i] = k.close.toNumber();
            backing.volumes[i] = k.volume.toNumber();
        }
    }

    // Create Views for MarketData
    // subarray creates a lightweight view. Consumers see correct length.
    const views: KlineBuffers = {
        times: backing.times.subarray(0, neededLen),
        opens: backing.opens.subarray(0, neededLen),
        highs: backing.highs.subarray(0, neededLen),
        lows: backing.lows.subarray(0, neededLen),
        closes: backing.closes.subarray(0, neededLen),
        volumes: backing.volumes.subarray(0, neededLen)
    };

    if (!current.klinesBuffers) current.klinesBuffers = {};
    current.klinesBuffers[timeframe] = views;
    current.lastUpdated = Date.now();
    this.data[symbol] = current;
  }

  // Legacy update methods refactored to use updateSymbol
  updatePrice(symbol: string, data: any) {
    try {
      const update: Partial<MarketData> = {
        nextFundingTime: data.nextFundingTime,
      };

      // Just pass raw values, applyUpdate handles Decimal conversion efficiently
      if (data.price) update.lastPrice = data.price;
      if (data.indexPrice) update.indexPrice = data.indexPrice;
      if (data.fundingRate) update.fundingRate = data.fundingRate;

      this.updateSymbol(symbol, update);
    } catch (e) {
        // ...
    }
  }

  updateTicker(symbol: string, data: any) {
    try {
      const update: Partial<MarketData> = {};

      if (data.lastPrice !== undefined) update.lastPrice = data.lastPrice;
      if (data.high !== undefined) update.highPrice = data.high;
      if (data.low !== undefined) update.lowPrice = data.low;
      if (data.vol !== undefined) update.volume = data.vol;
      if (data.quoteVol !== undefined) update.quoteVolume = data.quoteVol;

      // Calculate price change percent from open and last price if available
      let calculatedChange = false;
      if (data.open) {
        const open = new Decimal(data.open);
        const last = update.lastPrice ? new Decimal(update.lastPrice) : this.data[symbol]?.lastPrice;

        if (!open.isZero() && last) {
          update.priceChangePercent = last
            .minus(open)
            .div(open)
            .times(100);
          calculatedChange = true;
        }
      }

      if (!calculatedChange && data.change !== undefined) {
        update.priceChangePercent = new Decimal(data.change).times(100);
      }

      this.updateSymbol(symbol, update);
    } catch (e) {
       // ...
    }
  }

  updateDepth(symbol: string, data: any) {
    try {
      this.updateSymbol(symbol, {
        depth: { bids: data.bids, asks: data.asks },
      });
    } catch (e) {
       // ...
    }
  }

  updateKline(symbol: string, timeframe: string, data: any) {
    try {
      // Pass raw values (no Decimal creation here) to allow buffering
      // applySymbolKlines handles the conversion to Decimal lazily
      this.updateSymbolKlines(
        symbol,
        timeframe,
        [
          {
            open: data.o,
            high: data.h,
            low: data.l,
            close: data.c,
            volume: data.b,
            time: data.t,
          },
        ],
        "ws"
      );
    } catch (e) {
       // ...
    }
  }

  reset() {
    // Release all backing buffers back to pool before clearing
    this.backingBuffers.forEach((backing) => {
      this.bufferPool.release(backing.times);
      this.bufferPool.release(backing.opens);
      this.bufferPool.release(backing.highs);
      this.bufferPool.release(backing.lows);
      this.bufferPool.release(backing.closes);
      this.bufferPool.release(backing.volumes);
    });
    this.backingBuffers.clear();
    this.cacheMetadata.clear();
    this.data = {};
  }

  cleanup() {
    const now = Date.now();
    const stale: string[] = [];
    this.cacheMetadata.forEach((meta, symbol) => {
      if (now - meta.lastAccessed > TTL_MS) stale.push(symbol);
    });
    stale.forEach((symbol) => {
      this.releaseSymbolBackingBuffers(symbol);
      this.cacheMetadata.delete(symbol);
      delete this.data[symbol];
    });
    this.enforceCacheLimit();
  }

  subscribe(fn: (value: Record<string, MarketData>) => void) {
    fn(this.data);
    const cleanup = $effect.root(() => {
      $effect(() => {
        // Track.
        this.data;
        untrack(() => {
          if (this.notifyTimer) clearTimeout(this.notifyTimer);
          this.notifyTimer = setTimeout(() => {
            fn(this.data);
            this.notifyTimer = null;
          }, 10);
        });
      });
    });
    return () => {
      if (typeof cleanup === 'function') {
        (cleanup as Function)();
      } else if (cleanup && typeof (cleanup as any).stop === 'function') {
        (cleanup as any).stop();
      }
    };
  }

  subscribeStatus(fn: (value: WSStatus) => void) {
    fn(this.connectionStatus);
    const cleanup = $effect.root(() => {
      $effect(() => {
        this.connectionStatus; // Track
        untrack(() => {
          if (this.statusNotifyTimer) clearTimeout(this.statusNotifyTimer);
          this.statusNotifyTimer = setTimeout(() => {
            fn(this.connectionStatus);
            this.statusNotifyTimer = null;
          }, 10);
        });
      });
    });
    return () => {
      if (typeof cleanup === 'function') {
        (cleanup as Function)();
      } else if (cleanup && typeof (cleanup as any).stop === 'function') {
        (cleanup as any).stop();
      }
    };
  }

  private startFlushLoop() {
      if (!browser) return;

      const loop = () => {
          this.flushIntervalId = requestAnimationFrame(loop);

          const now = performance.now();
          // Throttle: 250ms normally
          // If idle, throttle to 1000ms to save CPU
          const interval = idleMonitor.isUserIdle ? 1000 : 250;

          if (now - this.lastFlushTime > interval) {
              this.lastFlushTime = now;
              // Only flush if tab is visible (RAF handles this mostly, but double check)
              if (!document.hidden) {
                  this.flushUpdates();
              }
          }
      };

      this.flushIntervalId = requestAnimationFrame(loop);
  }
}

export const marketState = new MarketManager();

// HMR: Cleanup on module disposal to prevent timer leaks
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    marketState.destroy();
  });
}
