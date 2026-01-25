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
  klines: Record<
    string,
    {
      open: Decimal;
      high: Decimal;
      low: Decimal;
      close: Decimal;
      volume: Decimal;
      time: number;
    }
  >;
  technicals?: import("../services/technicalsTypes").TechnicalsData;
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

class MarketManager {
  data = $state<Record<string, MarketData>>({});
  connectionStatus = $state<WSStatus>("disconnected");

  private cacheMetadata = new Map<string, CacheMetadata>();
  private pendingUpdates = new Map<string, Partial<MarketData>>();
  private cleanupIntervalId: any = null;
  private flushIntervalId: any = null;

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

  updateSymbol(symbol: string, partial: Partial<MarketData>) {
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
    this.touchSymbol(symbol);
    const current = this.getOrCreateSymbol(symbol);
    current.lastUpdated = Date.now();

    const toDecimal = (val: any) => (val !== undefined && val !== null ? new Decimal(val) : undefined);

    if (partial.lastPrice !== undefined) current.lastPrice = toDecimal(partial.lastPrice) ?? current.lastPrice;
    if (partial.indexPrice !== undefined) current.indexPrice = toDecimal(partial.indexPrice) ?? current.indexPrice;
    if (partial.highPrice !== undefined) current.highPrice = toDecimal(partial.highPrice) ?? current.highPrice;
    if (partial.lowPrice !== undefined) current.lowPrice = toDecimal(partial.lowPrice) ?? current.lowPrice;
    if (partial.volume !== undefined) current.volume = toDecimal(partial.volume) ?? current.volume;
    if (partial.quoteVolume !== undefined) current.quoteVolume = toDecimal(partial.quoteVolume) ?? current.quoteVolume;
    if (partial.priceChangePercent !== undefined) current.priceChangePercent = toDecimal(partial.priceChangePercent) ?? current.priceChangePercent;
    if (partial.fundingRate !== undefined) current.fundingRate = toDecimal(partial.fundingRate) ?? current.fundingRate;

    if (partial.nextFundingTime !== undefined) {
      if (typeof partial.nextFundingTime === "string") {
        current.nextFundingTime = parseInt(partial.nextFundingTime, 10);
      } else {
        current.nextFundingTime = partial.nextFundingTime;
      }
    }

    if (partial.depth !== undefined) current.depth = partial.depth;
    if (partial.technicals !== undefined) current.technicals = partial.technicals;
  }

  updateSymbolKlines(symbol: string, timeframe: string, klines: any[]) {
    this.touchSymbol(symbol);
    const current = this.getOrCreateSymbol(symbol);

    klines.forEach((k) => {
      current.klines[timeframe] = {
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
        time: k.time,
      };
    });

    this.enforceCacheLimit();
  }

  // Legacy update methods refactored to use updateSymbol
  updatePrice(symbol: string, data: any) {
    try {
      let nft = 0;
      if (data.nextFundingTime) {
        nft = /^\d+$/.test(data.nextFundingTime)
          ? parseInt(data.nextFundingTime, 10)
          : new Date(data.nextFundingTime).getTime();
      }

      // Defensive check
      const update: Partial<MarketData> = {
        nextFundingTime: nft,
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
        fn(this.data);
      });
    });
  }

  subscribeStatus(fn: (value: WSStatus) => void) {
    fn(this.connectionStatus);
    return $effect.root(() => {
      $effect(() => {
        fn(this.connectionStatus);
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
