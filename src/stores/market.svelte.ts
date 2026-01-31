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

      // Start metrics history recording (every 10s)
      /* TEMPORARILY DISABLED FOR CPU DEBUGGING
      setInterval(() => {
        this.snapshotMetrics();
      }, 10 * 1000);
      */

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

  private snapshotMetrics() {
    // Disabled logic
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

      const toDecimal = (val: any) => {
        try {
          return val !== undefined && val !== null ? new Decimal(val) : undefined;
        } catch (e) {
          // Silently fail for individual fields to protect the rest of the update
          return undefined;
        }
      };

      if (partial.lastPrice !== undefined) current.lastPrice = toDecimal(partial.lastPrice) ?? current.lastPrice;
      if (partial.indexPrice !== undefined) current.indexPrice = toDecimal(partial.indexPrice) ?? current.indexPrice;
      if (partial.highPrice !== undefined) current.highPrice = toDecimal(partial.highPrice) ?? current.highPrice;
      if (partial.lowPrice !== undefined) current.lowPrice = toDecimal(partial.lowPrice) ?? current.lowPrice;
      if (partial.volume !== undefined) current.volume = toDecimal(partial.volume) ?? current.volume;
      if (partial.quoteVolume !== undefined) current.quoteVolume = toDecimal(partial.quoteVolume) ?? current.quoteVolume;
      if (partial.priceChangePercent !== undefined) current.priceChangePercent = toDecimal(partial.priceChangePercent) ?? current.priceChangePercent;
      if (partial.fundingRate !== undefined) current.fundingRate = toDecimal(partial.fundingRate) ?? current.fundingRate;

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
        // console.log(`[Market] Updated technicals for ${symbol}`);
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
    // Simple reset would be better via interval, but for now we increment.
    // The PerformanceMonitor can handle the reset or we add a loop.
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
    // previously filtered REST updates if connected.
    // REMOVED: We now trust the upstream (MarketWatcher) to only send REST updates
    // if the WebSocket is disconnected OR if data is stale (gap detection).
    // This ensures we don't block valid fallback updates.

    // Merge strategy:
    // Optimized for append-only / live update behavior
    if (newKlines.length === 0) {
      // No updates
    } else if (history.length === 0) {
      newKlines.sort((a, b) => a.time - b.time);
      history = newKlines;
    } else {
      // Ensure incoming klines are sorted (usually are, but safety first)
      newKlines.sort((a, b) => a.time - b.time);

      const lastHistTime = history[history.length - 1].time;
      const firstNewTime = newKlines[0].time;

      if (firstNewTime > lastHistTime) {
        // Fast Path 1: Strict Append (New candle started)
        history = history.concat(newKlines);
      } else if (firstNewTime === lastHistTime && newKlines.length === 1) {
        // Fast Path 2: Live Update (Update current candle)
        // Copy to avoid mutating state proxy in-place before assignment
        const newHistory = [...history];
        newHistory[newHistory.length - 1] = newKlines[0];
        history = newHistory;
      } else if (firstNewTime >= lastHistTime) {
        // Fast Path 3: Overlap at the end (e.g. update last + new candle)
        const newHistory = [...history];
        for (const k of newKlines) {
          if (k.time === lastHistTime) {
            newHistory[newHistory.length - 1] = k;
          } else if (k.time > lastHistTime) {
            newHistory.push(k);
          }
        }
        history = newHistory;
      } else {
        // Slow Path: Historical backfill or disordered data
        // Use linear merge algorithm (O(N+M)) instead of Map+Sort (O(N log N))
        // Both history and newKlines are sorted.
        const merged: Kline[] = [];
        let i = 0;
        let j = 0;
        const hLen = history.length;
        const nLen = newKlines.length;

        // Helper to emulate Map behavior: overwrite if duplicate timestamp exists
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
            // Overwrite: newKlines takes precedence
            safePush(newKlines[j]);
            i++;
            j++;
          }
        }

        // Append remaining items
        while (i < hLen) safePush(history[i++]);
        while (j < nLen) safePush(newKlines[j++]);

        history = merged;
      }
    }

    // Limit history size to prevent memory leaks
    // Dynamically use user setting (default 2000)
    const userLimit = settingsState.chartHistoryLimit || 2000;
    const safetyLimit = 10000; // Hard cap to prevent OOM

    // Sliding Window Logic:
    // If enforceLimit is false (manual backfill), we allow growth up to safetyLimit.
    // If enforceLimit is true (live update), we respect the current history length if it exceeds userLimit,
    // essentially maintaining the manually expanded window size while sliding it forward.
    // This prevents live updates from truncating the history the user just loaded.
    let effectiveLimit = userLimit;

    if (!enforceLimit) {
      effectiveLimit = safetyLimit;
    } else {
      // If we already have more data than userLimit (due to manual loading), keep it (slide window)
      // but do not exceed safetyLimit.
      // We use (history.length - 1) because 'history' here already includes the new klines (appended/merged above)
      // Actually, history is the new array. We want to keep its size (minus maybe 1 if we are strictly sliding).
      // Simply: Math.max(history.length, userLimit) would effectively keep growing it?
      // No. If history.length is 3000, and we set limit to 3000, slice(-3000) keeps all.
      // But we want to slice to 3000.
      // Wait. If we just appended a live candle, history.length increased by 1.
      // We want to keep the previous length (window size).
      // But we don't know the previous length easily here without tracking.
      // Heuristic: If history.length > userLimit, we assume the user wanted that extra history.
      // However, we must ensure we don't grow indefinitely on live updates.
      // The logic `Math.max(current_length_before_update, userLimit)` is ideal.
      // Since we don't have `before_update`, we can use a slightly looser logic:
      // If current length is significantly larger than userLimit (e.g. > userLimit + 100), it's likely manual.
      // But `limit` is just a max size.
      // Let's rely on the fact that live updates add 1 candle at a time.
      // If we cap at `Math.max(history.length - 1, userLimit)`, we maintain the window.
      // (If we added 1, length is L+1. limit becomes L. slice(-L) removes 1. Window maintained).
      // If we added N (bulk), length is L+N. limit L. slice(-L) removes N.

      // But wait, if we bulk loaded (enforceLimit=false), we didn't slice.
      // Next live update (enforceLimit=true), we add 1.
      // We want to keep (L+N).
      // The issue is distinguishing "I just added 1 live candle" from "I have a big buffer".

      // Simplification: We trust `history` contains the valid data we want to keep.
      // We only slice if it exceeds safetyLimit OR if we want to enforce userLimit strictness?
      // No, we decided to support infinite scroll.
      // So, we only strictly enforce userLimit if we are NOT in an "expanded" state?
      // Actually, we can just default to safetyLimit for the upper bound, but we need to trim the *oldest*
      // if we are just moving forward in time.

      // Let's use the sliding window approach:
      // Limit = max(history.length - (newKlines.length), userLimit)
      // This tries to keep the size it had before this update.
      // This works for live updates (newKlines.length=1).
      // This works for REST updates (newKlines=1000).

      const previousLength = Math.max(0, history.length - newKlines.length);
      effectiveLimit = Math.min(Math.max(previousLength, userLimit), safetyLimit);
    }

    if (history.length > effectiveLimit) {
      history = history.slice(-effectiveLimit);
    }

    // [REACTIVITY FIX]
    // In Svelte 5, deep mutations on proxies work, BUT replacing the array reference
    // is the safest way to guarantee effect triggers in downstream components like CandleChartView.
    current.klines[timeframe] = [...history];
    current.lastUpdated = Date.now();

    // Trigger shape update on the symbol object itself to be safe
    // (This helps if components subscribe to 'symbol.klines' reference)
    this.data[symbol] = current;

    this.enforceCacheLimit();
  }

  // Legacy update methods refactored to use updateSymbol
  updatePrice(symbol: string, data: any) {
    try {
      // Note: Normalization to ms happens in applyUpdate
      const update: Partial<MarketData> = {
        nextFundingTime: data.nextFundingTime,
      };

      if (data.price) update.lastPrice = new Decimal(data.price);
      if (data.indexPrice) update.indexPrice = new Decimal(data.indexPrice);
      if (data.fundingRate) update.fundingRate = new Decimal(data.fundingRate);

      this.updateSymbol(symbol, update);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn(`[Market] Error updating price for ${symbol}:`, e);
      }
    }
  }

  updateTicker(symbol: string, data: any) {
    try {
      const update: Partial<MarketData> = {};

      // Validate and map fields safely
      if (data.lastPrice !== undefined && data.lastPrice !== null) {
        update.lastPrice = new Decimal(data.lastPrice);
      }
      if (data.high !== undefined && data.high !== null) {
        update.highPrice = new Decimal(data.high);
      }
      if (data.low !== undefined && data.low !== null) {
        update.lowPrice = new Decimal(data.low);
      }
      if (data.vol !== undefined && data.vol !== null) {
        update.volume = new Decimal(data.vol);
      }
      if (data.quoteVol !== undefined && data.quoteVol !== null) {
        update.quoteVolume = new Decimal(data.quoteVol);
      }

      // Calculate price change percent from open and last price if available
      // This is more reliable than interpreting the 'change' field which might be rate or percent
      let calculatedChange = false;
      if (data.open) {
        const open = new Decimal(data.open);
        const last = update.lastPrice || this.data[symbol]?.lastPrice;

        if (!open.isZero() && last) {
          update.priceChangePercent = last
            .minus(open)
            .div(open)
            .times(100);
          calculatedChange = true;
        }
      }

      // Fallback to API provided change if calculation wasn't possible
      if (
        !calculatedChange &&
        data.change !== undefined &&
        data.change !== null
      ) {
        // Bitunix used to send rate (0.045), but might send percent (4.5) now.
        // We try to infer or just stick to rate logic if no open price is available.
        // For now, we assume if we land here, we might still need the multiplication,
        // but prefer the calculation above.
        update.priceChangePercent = new Decimal(data.change).times(100);
      }

      this.updateSymbol(symbol, update);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn(`[Market] Error updating ticker for ${symbol}:`, e);
      }
    }
  }

  updateDepth(symbol: string, data: any) {
    try {
      this.updateSymbol(symbol, {
        depth: { bids: data.bids, asks: data.asks },
      });
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn(`[Market] Error updating depth for ${symbol}:`, e);
      }
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
      if (import.meta.env.DEV) {
        console.warn(`[Market] Error updating kline for ${symbol}:`, e);
      }
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
