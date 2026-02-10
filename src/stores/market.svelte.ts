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
import type { Kline, KlineBuffers } from "../services/technicalsTypes";
// [DIAGNOSTIC] Import diagnostic tool
import { getDiagnosticInstance } from "../utils/diagnose_bitunix_flow";

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
  private pendingKlineUpdates = new Map<string, any[]>();
  private cleanupIntervalId: any = null;
  private flushIntervalId: any = null;
  private telemetryIntervalId: any = null;
  private notifyTimer: any = null;
  private statusNotifyTimer: any = null;

  constructor() {
    if (browser) {
      this.cleanupIntervalId = setInterval(() => {
        this.cleanup();
      }, 30 * 1000); // Check every 30s

      // Batch flushing loop (4 FPS for better CPU efficiency)
      this.flushIntervalId = setInterval(() => {
        this.flushUpdates();
      }, 250);

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
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }
    if (this.telemetryIntervalId) {
      clearInterval(this.telemetryIntervalId);
      this.telemetryIntervalId = null;
    }
    this.cacheMetadata.clear();
    this.pendingUpdates.clear();
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

  private enforceCacheLimit() {
    // Dynamically respect settingsState.marketCacheSize
    const maxSize = getMaxCacheSize();
    while (Object.keys(this.data).length > maxSize) {
      const toEvict = this.evictLRU();
      if (!toEvict) {
        // Fallback: If metadata is out of sync, delete arbitrary key
        const key = Object.keys(this.data)[0];
        if (key) delete this.data[key];
        break;
      }
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
    // [DIAGNOSTIC] Log flush execution with pending updates info
    const totalPending = this.pendingUpdates.size + this.pendingKlineUpdates.size;
    // if (totalPending > 0) {
    //   console.debug(`[DIAGNOSTIC] flushUpdates() executing - pendingUpdates: ${this.pendingUpdates.size}, pendingKlineUpdates: ${this.pendingKlineUpdates.size}`);
    // }
    
    const diagnostic = getDiagnosticInstance();
    if (diagnostic) {
      diagnostic.recordFlush(this.pendingUpdates.size);
    }
    
    if (this.pendingUpdates.size === 0 && this.pendingKlineUpdates.size === 0) return;

    untrack(() => {
      // 1. Apply Market Data Updates (Price, Ticker, etc.)
      if (this.pendingUpdates.size > 0) {
        this.pendingUpdates.forEach((partial, symbol) => {
          try {
            this.applyUpdate(symbol, partial);
          } catch (e) {
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
              if (import.meta.env.DEV) console.error(`[Market] Error flushing klines for ${key}`, e);
            }
          }
        });
        this.pendingKlineUpdates.clear();
      }
    });

    this.enforceCacheLimit();
  }

  private applyUpdate(symbol: string, partial: any) {
    try {
      this.touchSymbol(symbol);
      const current = this.getOrCreateSymbol(symbol);
      const previousTimestamp = current.lastUpdated || 0;
      current.lastUpdated = Date.now();
      
      // [DIAGNOSTIC] Track timestamp progression
      const diagnostic = getDiagnosticInstance();
      if (diagnostic) {
        diagnostic.recordUpdate(current.lastUpdated);
      }
      
      if (current.lastUpdated <= previousTimestamp && previousTimestamp > 0) {
        // console.debug(`[DIAGNOSTIC] WARNING: lastUpdated timestamp NOT increasing for ${symbol} - prev: ${previousTimestamp}, new: ${current.lastUpdated}`);
      }

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

    // Optimization: Deduplicate raw updates first to avoid unnecessary Decimal allocation
    if (klines.length > 1 && (source === "ws" || klines[0]?.open instanceof Decimal === false)) {
        // Sort raw data
        klines.sort((a, b) => a.time - b.time);

        const dedupedRaw: any[] = [];
        let lastTime = -1;
        // Simple linear deduplication
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

    // Normalize new klines to correct Kline type
    // We perform this here (lazy) instead of on receipt
    let newKlines: Kline[] = klines.map(k => ({
      open: k.open instanceof Decimal ? k.open : new Decimal(k.open),
      high: k.high instanceof Decimal ? k.high : new Decimal(k.high),
      low: k.low instanceof Decimal ? k.low : new Decimal(k.low),
      close: k.close instanceof Decimal ? k.close : new Decimal(k.close),
      volume: k.volume instanceof Decimal ? k.volume : new Decimal(k.volume),
      time: k.time // number
    }));

    // Deduplicate incoming batch (keep latest per timestamp)
    if (newKlines.length > 1) {
      newKlines.sort((a, b) => a.time - b.time);
      const deduped: Kline[] = [];
      let lastTime = -1;
      for (const k of newKlines) {
        if (k.time === lastTime) {
          deduped[deduped.length - 1] = k; // Overwrite with newer
        } else {
          deduped.push(k);
          lastTime = k.time;
        }
      }
      newKlines = deduped;
    }

    // Get existing history or init empty
    let history = current.klines[timeframe] || [];
    if (!current.klines[timeframe]) current.klines[timeframe] = history;

    // Get existing buffers
    if (!current.klinesBuffers) current.klinesBuffers = {};
    let buffers = current.klinesBuffers[timeframe];

    // Calculate Limit *BEFORE* merging to optimize allocations
    const userLimit = settingsState.chartHistoryLimit || 2000;
    const safetyLimit = 10000;
    let effectiveLimit = userLimit;
    if (!enforceLimit) {
      effectiveLimit = safetyLimit;
    } else {
      // Logic: Allow growth up to safetyLimit, but generally aim for userLimit
      // If we already have more data (backfill), keep it up to safety limit.
      const previousLength = Math.max(0, history.length);
      effectiveLimit = Math.min(Math.max(previousLength, userLimit), safetyLimit);
    }

    // Helper: Build full buffers from history (Slow Path)
    const rebuildBuffers = (sourceKlines: Kline[]) => {
      const len = sourceKlines.length;
      const b: KlineBuffers = {
        times: new Float64Array(len),
        opens: new Float64Array(len),
        highs: new Float64Array(len),
        lows: new Float64Array(len),
        closes: new Float64Array(len),
        volumes: new Float64Array(len),
      };

      for (let i = 0; i < len; i++) {
        const k = sourceKlines[i];
        b.times[i] = k.time;
        b.opens[i] = k.open.toNumber();
        b.highs[i] = k.high.toNumber();
        b.lows[i] = k.low.toNumber();
        b.closes[i] = k.close.toNumber();
        b.volumes[i] = k.volume.toNumber();
      }
      return b;
    };

    // Helper: Append to buffers (Fast Path)
    const appendBuffers = (oldBuffers: KlineBuffers, appendKlines: Kline[]): KlineBuffers => {
      const oldLen = oldBuffers.times.length;
      const newLen = oldLen + appendKlines.length;
      const b: KlineBuffers = {
        times: new Float64Array(newLen),
        opens: new Float64Array(newLen),
        highs: new Float64Array(newLen),
        lows: new Float64Array(newLen),
        closes: new Float64Array(newLen),
        volumes: new Float64Array(newLen),
      };

      // Copy old data (fast native copy)
      b.times.set(oldBuffers.times);
      b.opens.set(oldBuffers.opens);
      b.highs.set(oldBuffers.highs);
      b.lows.set(oldBuffers.lows);
      b.closes.set(oldBuffers.closes);
      b.volumes.set(oldBuffers.volumes);

      // Add new data
      for (let i = 0; i < appendKlines.length; i++) {
        const k = appendKlines[i];
        const idx = oldLen + i;
        b.times[idx] = k.time;
        b.opens[idx] = k.open.toNumber();
        b.highs[idx] = k.high.toNumber();
        b.lows[idx] = k.low.toNumber();
        b.closes[idx] = k.close.toNumber();
        b.volumes[idx] = k.volume.toNumber();
      }
      return b;
    };

    // Helper: Update last N items in buffers (In-place)
    const updateBufferTail = (bufs: KlineBuffers, updateKlines: Kline[], startIndex: number) => {
      for (let i = 0; i < updateKlines.length; i++) {
        const k = updateKlines[i];
        const idx = startIndex + i;
        if (idx < bufs.times.length) {
          bufs.times[idx] = k.time;
          bufs.opens[idx] = k.open.toNumber();
          bufs.highs[idx] = k.high.toNumber();
          bufs.lows[idx] = k.low.toNumber();
          bufs.closes[idx] = k.close.toNumber();
          bufs.volumes[idx] = k.volume.toNumber();
        }
      }
    };

    // Merge strategy: Optimized for memory usage
    if (newKlines.length === 0) {
      // No updates
    } else if (history.length === 0) {
      newKlines.sort((a, b) => a.time - b.time);
      if (newKlines.length > effectiveLimit) {
          newKlines = newKlines.slice(-effectiveLimit);
      }
      history = newKlines;
      current.klines[timeframe] = history;
      buffers = rebuildBuffers(history);
    } else {
      // Ensure incoming klines are sorted (usually are, but safety first)
      newKlines.sort((a, b) => a.time - b.time);

      const lastHistTime = history[history.length - 1].time;
      const firstNewTime = newKlines[0].time;

      if (firstNewTime > lastHistTime) {
        // Fast Path 1: Strict Append (New candle started)
        history.push(...newKlines);

        // Optimize: Check limit *immediately* to keep array small
        if (history.length > effectiveLimit) {
             const overflow = history.length - effectiveLimit;
             // Use splice for in-place removal to avoid new array allocation
             history.splice(0, overflow);
             // Since we spliced, buffers are out of sync. Rebuild is safest.
             buffers = rebuildBuffers(history);
        } else {
             // Only append buffers if valid
             if (buffers) {
                 buffers = appendBuffers(buffers, newKlines);
             } else {
                 buffers = rebuildBuffers(history);
             }
        }

      } else if (firstNewTime === lastHistTime && newKlines.length === 1) {
        // Fast Path 2: Live Update (Update current candle)
        history[history.length - 1] = newKlines[0];

        if (buffers && buffers.times.length === history.length) {
            updateBufferTail(buffers, newKlines, buffers.times.length - 1);
        } else {
            buffers = rebuildBuffers(history);
        }

      } else if (firstNewTime >= lastHistTime) {
        // Fast Path 3: Overlap at the end
        const itemsToAppend: Kline[] = [];
        for (const k of newKlines) {
          if (k.time === lastHistTime) {
            history[history.length - 1] = k;
            if (buffers && buffers.times.length === history.length) {
                updateBufferTail(buffers, [k], buffers.times.length - 1);
            }
          } else if (k.time > lastHistTime) {
            history.push(k);
            itemsToAppend.push(k);
          }
        }

        if (history.length > effectiveLimit) {
             history.splice(0, history.length - effectiveLimit);
             buffers = rebuildBuffers(history);
        } else if (itemsToAppend.length > 0) {
             if (buffers) buffers = appendBuffers(buffers, itemsToAppend);
             else buffers = rebuildBuffers(history);
        }

      } else {
        // Slow Path: Historical backfill or disordered data
        // Optimization: Reverse Merge Strategy to avoid huge allocations
        // We only need the latest 'effectiveLimit' items.
        // By merging backwards, we can stop exactly when we have enough items.

        const hLen = history.length;
        const nLen = newKlines.length;
        // Estimate unique items (worst case hLen + nLen, best case max(hLen, nLen))
        // We cap at effectiveLimit immediately.
        const targetSize = Math.min(effectiveLimit, hLen + nLen);
        const merged = new Array(targetSize);

        let i = hLen - 1;
        let j = nLen - 1;
        let k = targetSize - 1;

        while (k >= 0) {
            if (i < 0 && j < 0) break;

            // If one source is exhausted, take from the other
            if (i < 0) {
                merged[k--] = newKlines[j--];
                continue;
            }
            if (j < 0) {
                merged[k--] = history[i--];
                continue;
            }

            const hTime = history[i].time;
            const nTime = newKlines[j].time;

            if (hTime > nTime) {
                merged[k--] = history[i--];
            } else if (nTime > hTime) {
                merged[k--] = newKlines[j--];
            } else {
                // Exact match: prefer new update (newKlines)
                merged[k--] = newKlines[j--];
                i--; // Skip old version
            }
        }

        // If we exhausted both arrays but k >= 0 (because of duplicates reducing size),
        // we need to slice the front of 'merged' which might be empty/undefined.
        // Wait, if duplicates occurred, k would not decrement as fast as we wanted?
        // No, k decrements every write. If duplicate, we decrement i and j but write only once (decrement k once).
        // My logic above: "merged[k--] = ...; i--;" writes once, consumes both. Correct.
        // BUT: if duplicates exist, the actual count of unique items is LESS than targetSize (which assumed worst case).
        // So k will stop at some value >= 0.
        // Example: target 10. Actual unique 9. k stops at 0. merged[0] is empty.
        // So we need to slice `merged.slice(k + 1)`.

        if (k >= 0) {
             history = merged.slice(k + 1);
        } else {
             history = merged;
        }

        current.klines[timeframe] = history;
        buffers = rebuildBuffers(history);
      }
    }

    current.klinesBuffers[timeframe] = buffers;
    current.lastUpdated = Date.now();

    // Hardening: Runtime Consistency Check (DEV only)
    if (import.meta.env.DEV) {
        if (buffers && history.length !== buffers.times.length) {
            console.error(`[Market] Consistency Check Failed for ${symbol}:${timeframe}. History: ${history.length}, Buffer: ${buffers.times.length}`);
        }
    }

    // FORCE REACTIVITY
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
}

export const marketState = new MarketManager();

// HMR: Cleanup on module disposal to prevent timer leaks
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    marketState.destroy();
  });
}
