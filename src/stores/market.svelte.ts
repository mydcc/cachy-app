/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { Decimal } from "decimal.js";
import { browser } from "$app/environment";
import { untrack } from "svelte";

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
// LRU Cache Configuration
const MAX_CACHE_SIZE = 50; // Massiv reduced from 600 to prevent RAM overflow
const TTL_MS = 10 * 60 * 1000; // 10 minutes

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
      }, 60 * 1000);

      // Batch flushing loop (10 FPS)
      this.flushIntervalId = setInterval(() => {
        this.flushUpdates();
      }, 100);

      // Start metrics history recording (every 10s)
      // setInterval(() => {
      //   this.snapshotMetrics();
      // }, 10 * 1000);
    }
  }

  private snapshotMetrics() {
    const now = Date.now();
    // Optimization: Only process symbols that have depth data and were recently updated
    // Instead of iterating all, we iterate valid keys. With MAX_CACHE_SIZE=50 this is fast enough.
    const keys = Object.keys(this.data);

    // Performance Guard: if somehow we have too many keys, slice them
    const safeKeys = keys.length > 50 ? keys.slice(0, 50) : keys;

    safeKeys.forEach((key) => {
      const market = this.data[key];
      // Only record if we have depth and price
      if (
        !market.depth ||
        !market.lastPrice ||
        market.depth.bids.length === 0 ||
        market.depth.asks.length === 0
      ) return;

      const bestBid = parseFloat(market.depth.bids[0][0]);
      const bestAsk = parseFloat(market.depth.asks[0][0]);

      if (!bestBid || !bestAsk) return;

      const spread = (bestAsk - bestBid) / bestBid; // Relative spread

      // Calculate Imbalance (Top 5 levels)
      const bidVol = market.depth.bids.slice(0, 5).reduce((acc, level) => acc + parseFloat(level[1]), 0);
      const askVol = market.depth.asks.slice(0, 5).reduce((acc, level) => acc + parseFloat(level[1]), 0);
      const imbalance = (bidVol + askVol) > 0 ? bidVol / (bidVol + askVol) : 0.5;

      const snapshot: MetricSnapshot = {
        time: now,
        spread,
        imbalance,
        price: market.lastPrice.toNumber()
      };

      // Initialize if missing
      if (!market.metricsHistory) market.metricsHistory = [];

      // Add new snapshot
      market.metricsHistory.push(snapshot);

      // Keep last 30 entries (5 minutes) - reduced from 60 for memory safety
      if (market.metricsHistory.length > 30) {
        market.metricsHistory.shift();
      }
    });
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
    while (Object.keys(this.data).length > MAX_CACHE_SIZE) {
      const toEvict = this.evictLRU();
      if (!toEvict) break;
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

  private applyUpdate(symbol: string, partial: Partial<MarketData>) {
    this.touchSymbol(symbol);
    const current = this.getOrCreateSymbol(symbol);

    if (partial.lastPrice !== undefined) current.lastPrice = partial.lastPrice;
    if (partial.indexPrice !== undefined)
      current.indexPrice = partial.indexPrice;
    if (partial.highPrice !== undefined) current.highPrice = partial.highPrice;
    if (partial.lowPrice !== undefined) current.lowPrice = partial.lowPrice;
    if (partial.volume !== undefined) current.volume = partial.volume;
    if (partial.quoteVolume !== undefined)
      current.quoteVolume = partial.quoteVolume;
    if (partial.priceChangePercent !== undefined)
      current.priceChangePercent = partial.priceChangePercent;
    if (partial.fundingRate !== undefined)
      current.fundingRate = partial.fundingRate;
    if (partial.nextFundingTime !== undefined)
      current.nextFundingTime = partial.nextFundingTime;
    if (partial.depth !== undefined) current.depth = partial.depth;
    if (partial.technicals !== undefined)
      current.technicals = partial.technicals;
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
