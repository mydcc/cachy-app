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
import type { Kline } from "../services/technicalsTypes";

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
  technicals?: Record<string, import("../services/technicalsTypes").TechnicalsData>;
  metricsHistory?: MetricSnapshot[];
  lastUpdated?: number; // Optimization: only snapshot fresh data
}

export interface MetricSnapshot {
  time: number;
  spread: number;
  imbalance: number; // Bid Ratio (0-1)
  price: number;
}

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
  private pendingUpdates = new Map<string, Partial<MarketData>>();
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

  updateSymbol(symbol: string, partial: any) {
    // Instead of updating immediately, we buffer updates
    const existing = this.pendingUpdates.get(symbol) || {};

    // Merge partials manually to ensure nested objects like depth/technicals don't get lost if partial is shallow
    // However, partial is flat except for depth/technicals/klines.
    // Simple spread is efficient for gathering updates.
    this.pendingUpdates.set(symbol, { ...existing, ...partial });

    // Safety: Prevent memory leak if flush interval stalls
    if (this.pendingUpdates.size > 100) {
      if (import.meta.env.DEV) {
        console.warn("[Market] Flush buffer overflow, forcing flush.");
      }
      this.flushUpdates();
    }

    // Note: We do NOT touch LRU here to save CPU. LRU touch will happen on flush.
  }

  private flushUpdates() {
    if (this.pendingUpdates.size === 0) return;

    // Apply all buffered updates in one go
    untrack(() => { // Ensure we don't track dependencies inside this write operation if called from effect (unlikely here but safe)
      this.pendingUpdates.forEach((partial, symbol) => {
        this.applyUpdate(symbol, partial);
      });
    });

    this.pendingUpdates.clear();
    this.enforceCacheLimit();
  }

  private applyUpdate(symbol: string, partial: any) {
    try {
      this.touchSymbol(symbol);
      const current = this.getOrCreateSymbol(symbol);
      current.lastUpdated = Date.now();

      // Optimization: Check for equality before creating new Decimal
      const toDecimal = (val: any, currentVal: Decimal | null | undefined): Decimal | undefined | null => {
        try {
          if (val === undefined || val === null) return undefined;
          if (currentVal && currentVal.toString() === String(val)) {
             return currentVal; // Reuse existing object
          }
          return new Decimal(val);
        } catch (e) {
          // Silently fail for individual fields to protect the rest of the update
          return undefined;
        }
      };

      if (partial.lastPrice !== undefined) {
          const newVal = toDecimal(partial.lastPrice, current.lastPrice);
          if (newVal !== undefined) current.lastPrice = newVal;
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
    this.touchSymbol(symbol);
    const current = this.getOrCreateSymbol(symbol);

    // Normalize new klines to correct Kline type
    let newKlines: Kline[] = klines.map(k => ({
      open: k.open instanceof Decimal ? k.open : new Decimal(k.open),
      high: k.high instanceof Decimal ? k.high : new Decimal(k.high),
      low: k.low instanceof Decimal ? k.low : new Decimal(k.low),
      close: k.close instanceof Decimal ? k.close : new Decimal(k.close),
      volume: k.volume instanceof Decimal ? k.volume : new Decimal(k.volume),
      time: k.time // number
    }));

    // Get existing history or init empty
    let history = current.klines[timeframe] || [];

    // PROTECTION: Single Source of Truth for Live Candle (WebSocket)
    if (source === "rest" && history.length > 0) {
      const lastKnownTime = history[history.length - 1].time;
      newKlines = newKlines.filter(k => k.time !== lastKnownTime);
    }

    // Merge strategy:
    // Optimized for append-only / live update behavior
    if (newKlines.length === 0) {
      // No updates
    } else if (history.length === 0) {
      newKlines.sort((a, b) => a.time - b.time);
      history = newKlines;
      // Assign new array
      current.klines[timeframe] = history;
    } else {
      // Ensure incoming klines are sorted (usually are, but safety first)
      newKlines.sort((a, b) => a.time - b.time);

      const lastHistTime = history[history.length - 1].time;
      const firstNewTime = newKlines[0].time;

      if (firstNewTime > lastHistTime) {
        // Fast Path 1: Strict Append (New candle started)
        // Optimization: Push in place instead of concat (allocates new array)
        history.push(...newKlines);
      } else if (firstNewTime === lastHistTime && newKlines.length === 1) {
        // Fast Path 2: Live Update (Update current candle)
        // In-place update is reactive in Svelte 5 state
        history[history.length - 1] = newKlines[0];
      } else if (firstNewTime >= lastHistTime) {
        // Fast Path 3: Overlap at the end (e.g. update last + new candle)
        // Optimization: In-place update + push
        for (const k of newKlines) {
          if (k.time === lastHistTime) {
            history[history.length - 1] = k;
          } else if (k.time > lastHistTime) {
            history.push(k);
          }
        }
      } else {
        // Slow Path: Historical backfill or disordered data
        // Use linear merge algorithm (O(N+M))
        const merged: Kline[] = [];
        let i = 0;
        let j = 0;
        const hLen = history.length;
        const nLen = newKlines.length;

        const safePush = (k: Kline) => {
          const last = merged.length > 0 ? merged[merged.length - 1] : null;
          if (last && last.time === k.time) {
            merged[merged.length - 1] = k;
          } else {
            merged.push(k);
          }
        };

        while (i < hLen && j < nLen) {
          const hTime = history[i].time;
          const nTime = newKlines[j].time;

          if (hTime < nTime) {
            safePush(history[i]);
            i++;
          } else if (hTime > nTime) {
            safePush(newKlines[j]);
            j++;
          } else {
            safePush(newKlines[j]);
            i++;
            j++;
          }
        }

        while (i < hLen) safePush(history[i++]);
        while (j < nLen) safePush(newKlines[j++]);

        history = merged;
        // Assign new merged array
        current.klines[timeframe] = history;
      }
    }

    // Limit history size to prevent memory leaks
    const userLimit = settingsState.chartHistoryLimit || 2000;
    const safetyLimit = 10000; // Hard cap

    let effectiveLimit = userLimit;
    if (!enforceLimit) {
      effectiveLimit = safetyLimit;
    } else {
      const previousLength = Math.max(0, history.length - newKlines.length);
      effectiveLimit = Math.min(Math.max(previousLength, userLimit), safetyLimit);
    }

    if (history.length > effectiveLimit) {
      // Slicing creates a new array, but it's necessary for GC
      const sliced = history.slice(-effectiveLimit);
      current.klines[timeframe] = sliced;
    }

    current.lastUpdated = Date.now();
    this.enforceCacheLimit();
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
      this.updateSymbolKlines(symbol, timeframe, [
        {
          open: new Decimal(data.o),
          high: new Decimal(data.h),
          low: new Decimal(data.l),
          close: new Decimal(data.c),
          volume: new Decimal(data.b),
          time: data.t,
        },
      ]);
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
    return $effect.root(() => {
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
  }

  subscribeStatus(fn: (value: WSStatus) => void) {
    fn(this.connectionStatus);
    return $effect.root(() => {
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
  }
}

export const marketState = new MarketManager();

// HMR: Cleanup on module disposal to prevent timer leaks
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    marketState.destroy();
  });
}
