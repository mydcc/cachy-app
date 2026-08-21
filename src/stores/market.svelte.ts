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

import { _ } from "../locales/i18n";
import { get } from "svelte/store";
import { browser } from "$app/environment";
import { untrack } from "svelte";
import { settingsState } from "./settings.svelte";
import { isUnsafeObjectKey } from "../utils/utils";
import { SymbolCache } from "./market/symbolCache";
import { KlineBufferManager } from "./market/klineBuffers";
import { MarketTelemetry } from "./market/telemetry.svelte";
import { applyUpdate } from "./market/applyUpdate";
import { updatePrice, updateTicker, updateDepth, updateKline } from "./market/legacyUpdates";
import type {
  MarketData,
  TradingPairInfo,
  PositionTier,
  WSStatus,
  MarketUpdatePayload,
  RawKline,
  RawPriceUpdate,
  RawTickerUpdate,
  RawDepthUpdate,
  RawKlineWsMessage,
  RawNumeric
} from "./market/types";

export type {
  MarketData,
  TradingPairInfo,
  PositionTier,
  WSStatus,
  MarketUpdatePayload,
  RawKline,
  RawPriceUpdate,
  RawTickerUpdate,
  RawDepthUpdate,
  RawKlineWsMessage,
  RawNumeric
};

const KLINE_BUFFER_HARD_LIMIT = 2000; // Hard cap for pending kline updates

export class MarketManager {
  data = $state<Record<string, MarketData>>({});
  connectionStatus = $state<WSStatus>("disconnected");

  // Read-only Bitunix metadata, fetched lazily per symbol (see
  // tradeService.fetchTradingPairInfo / fetchPositionTiers). Not part of
  // `data` — static-ish, not a live tick field.
  symbolMeta = $state<Record<string, TradingPairInfo>>({});
  positionTiers = $state<Record<string, PositionTier[]>>({});

  setSymbolMeta(symbol: string, info: TradingPairInfo) {
    this.symbolMeta[symbol] = info;
  }

  setPositionTiers(symbol: string, tiers: PositionTier[]) {
    this.positionTiers[symbol] = tiers;
  }

  private symbolCache: SymbolCache;
  private klineBufferManager: KlineBufferManager;
  private marketTelemetry: MarketTelemetry;

  // Test visibility getters
  get cacheMetadata() { return this.symbolCache.metadata; }
  get backingBuffers() { return this.klineBufferManager.backingBuffers; }
  get bufferPool() { return this.klineBufferManager.bufferPool; }

  // Delegate for public telemetry access
  get telemetry() {
    return this.marketTelemetry.metrics;
  }

  private pendingUpdates = new Map<string, MarketUpdatePayload>();
  private pendingKlineUpdates = new Map<string, RawKline[]>();
  // `ReturnType<typeof ...>` rather than `number`: the handle is a number in the
  // browser and a Timeout object under Node, and these run in both.
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
  private flushIntervalId: ReturnType<typeof setInterval> | null = null;
  private lastFlushTime: number = 0;

  constructor() {
    this.klineBufferManager = new KlineBufferManager();
    this.symbolCache = new SymbolCache((symbol: string) => {
      this.klineBufferManager.releaseSymbol(symbol);
      delete this.data[symbol];
    });
    this.marketTelemetry = new MarketTelemetry();

    if (browser) {
      this.cleanupIntervalId = setInterval(() => {
        this.cleanup();
      }, 30 * 1000); // Check every 30s

      // Batch flushing loop (4 FPS for better CPU efficiency)
      this.flushIntervalId = setInterval(() => {
        this.flushUpdates();
      }, 250);
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
    this.marketTelemetry.destroy();
    this.symbolCache.clear();
    this.pendingUpdates.clear();
    this.klineBufferManager.clear();
    this.data = {};
  }

  public getOrCreateSymbol(symbol: string): MarketData {
    if (isUnsafeObjectKey(symbol)) {
      throw new Error(`Unsafe symbol key: ${symbol}`);
    }
    if (!this.data[symbol]) {
      this.data[symbol] = {
        symbol,
        lastPrice: null,
        indexPrice: null,
        markPrice: null,
        fundingRate: null,
        nextFundingTime: null,
        klines: {},
        klinesBuffers: new Map(),
      };
    }
    return this.data[symbol];
  }

  // Helper: Touch symbol to update LRU
  public touchSymbol(symbol: string) {
    this.symbolCache.touch(symbol);
  }

  private enforceCacheLimit() {
    this.symbolCache.enforceLimit(this.symbolCache.metadata.size, () => Array.from(this.symbolCache.metadata.keys()));
  }

  updateSymbol(symbol: string, partial: MarketUpdatePayload) {
    // Instead of updating immediately, we buffer updates
    const existing = this.pendingUpdates.get(symbol) || {};

    // Merge partials manually to ensure nested objects like depth/technicals don't get lost if partial is shallow
    // However, partial is flat except for depth/technicals/klines.
    // `{ ...existing, ...partial }` would silently clobber a real, not-yet-
    // flushed value: callers build partial objects like
    // `{ markPrice: mp ? new Decimal(mp) : undefined }`, so a WS push that
    // doesn't repeat every field (e.g. an index-price-only price channel
    // tick) still carries an explicit `markPrice: undefined` key, which a
    // plain spread applies — wiping out an earlier, real markPrice buffered
    // in this same flush window before it ever reaches `current` (BUG-0065).
    // applyUpdate() already skips `undefined` fields once flushed; the
    // buffer merge must skip them for the same reason, or that guard never
    // gets to see the real value at all.
    const merged: MarketUpdatePayload = existing;
    const mergedRecord = merged as Record<string, unknown>;

    // Performance: Object.keys + direct assignment is ~40% faster than { ...existing } spread
    // We modify existing in place to avoid creating a new object on every high-freq WS tick.
    const keys = Object.keys(partial) as (keyof MarketUpdatePayload)[];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = partial[key];
      if (value !== undefined) {
        mergedRecord[key] = value;
      }
    }
    this.pendingUpdates.set(symbol, merged);

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
            if (import.meta.env.DEV) console.error(`[Market] Error flushing update for ${symbol}`, e);
          }
        });
        this.pendingUpdates.clear();
      }

      // Gap detection for alerts
      if (this.pendingUpdates.size > 0 || this.pendingKlineUpdates.size > 0) {
        const now = Date.now();
        // Determine if we experienced a data gap (>10s)
        if (this.lastFlushTime && now - this.lastFlushTime > 10000) {
             import('../services/toastService.svelte').then(m => {
                 const t = get(_);
                 m.toastService.error((t as (key: string) => string)("dashboard.alerts.gapDetected") || "Market Data Gap Detected. Alert evaluation may have missed intermediate prices.");
             }).catch(() => {});
        }
        this.lastFlushTime = now;
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

  private applyUpdate(symbol: string, partial: MarketUpdatePayload) {
    applyUpdate(this, symbol, partial);
  }

  updateTelemetry(partial: Partial<typeof this.telemetry>) {
    this.marketTelemetry.update(partial);
  }

  recordApiCall() {
    this.marketTelemetry.recordApiCall();
  }

  updateSymbolKlines(
    symbol: string,
    timeframe: string,
    klines: RawKline[],
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

      // Optimization: In-place deduplication for the same candle.
      // High-frequency WS updates often overwrite the exact same candle timestamp repeatedly.
      for (const k of klines) {
        if (pending.length > 0 && pending[pending.length - 1].time === k.time) {
          pending[pending.length - 1] = k;
        } else {
          pending.push(k);
        }
      }
      if (pending.length > KLINE_BUFFER_HARD_LIMIT) pending.splice(0, pending.length - KLINE_BUFFER_HARD_LIMIT);

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
  public applySymbolKlines(
    symbol: string,
    timeframe: string,
    klines: RawKline[],
    source: "rest" | "ws" = "rest",
    enforceLimit: boolean = true
  ) {
    this.touchSymbol(symbol);
    const current = this.getOrCreateSymbol(symbol);
    this.klineBufferManager.applySymbolKlines(symbol, timeframe, klines, source, enforceLimit, current);
    this.data[symbol] = current;
  }

  // Legacy update methods refactored to use updateSymbol
  updatePrice(symbol: string, data: RawPriceUpdate) {
    updatePrice(this, symbol, data);
  }

  updateTicker(symbol: string, data: RawTickerUpdate) {
    updateTicker(this, symbol, data);
  }

  updateDepth(symbol: string, data: RawDepthUpdate) {
    updateDepth(this, symbol, data);
  }

  updateKline(symbol: string, timeframe: string, data: RawKlineWsMessage) {
    updateKline(this, symbol, timeframe, data);
  }

  reset() {
    this.klineBufferManager.clear();
    this.symbolCache.clear();
    this.data = {};
  }

  cleanup() {
    this.symbolCache.cleanupStale();
    this.enforceCacheLimit();
  }


}

export const marketState = new MarketManager();

// HMR: Cleanup on module disposal to prevent timer leaks
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    marketState.destroy();
  });
}
