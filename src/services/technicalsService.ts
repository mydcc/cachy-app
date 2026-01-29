/*
 * Copyright (C) 2026 MYDCT
 *
 * Market Analyst Service
 * Background service that cycles through favorite symbols to calculate
 * key indicators without overloading the CPU or API.
 */

import { Decimal } from "decimal.js";
import { browser } from "$app/environment";
import type { IndicatorSettings } from "../stores/indicator.svelte";
import type { TechnicalsData, IndicatorResult, SerializedTechnicalsData, SerializedIndicatorResult, SerializedDivergenceItem } from "./technicalsTypes";
import { type Kline } from "../utils/indicators";
import {
  calculateAllIndicators,
  getEmptyData,
} from "../utils/technicalsCalculator";

export { JSIndicators } from "../utils/indicators";
export type { Kline, TechnicalsData, IndicatorResult };

// Cache for indicator calculations - Dynamic configuration from settings
// Initial defaults, will be overridden by settings on app init
let MAX_CACHE_SIZE = 100;
let CACHE_TTL_MS = 60 * 1000; // 1 minute default

// Update cache settings dynamically
export function updateCacheSettings(cacheSize: number, cacheTTL: number) {
  MAX_CACHE_SIZE = cacheSize;
  CACHE_TTL_MS = cacheTTL * 1000;

  if (import.meta.env.DEV) {
    console.log(`[Technicals] Cache config updated: size=${MAX_CACHE_SIZE}, TTL=${CACHE_TTL_MS}ms`);
  }
}

// Get current cache stats for monitoring
export function getCacheStats() {
  return {
    size: calculationCache.size,
    maxSize: MAX_CACHE_SIZE,
    ttl: CACHE_TTL_MS,
  };
}

const calculationCache = new Map<string, TechnicalsResultCacheEntry>();

interface TechnicalsResultCacheEntry {
  data: TechnicalsData;
  timestamp: number;
  lastAccessed: number; // Track LRU
}

// Track last cleanup time to avoid excessive cleanup calls
let lastCleanupTime = 0;
const CLEANUP_INTERVAL_MS = 30000; // 30 seconds between cleanups

// Cleanup cache entries older than TTL
function cleanupStaleCache() {
  const now = Date.now();

  // Throttle cleanup - only run every 30 seconds
  if (now - lastCleanupTime < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanupTime = now;
  const staleKeys: string[] = [];

  calculationCache.forEach((entry, key) => {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      staleKeys.push(key);
    }
  });

  staleKeys.forEach(key => calculationCache.delete(key));

  if (import.meta.env.DEV && staleKeys.length > 0) {
    console.log(`[Technicals] Cleaned ${staleKeys.length} stale cache entries`);
  }
}

// --- Worker Manager (Singleton) ---
class TechnicalsWorkerManager {
  private worker: Worker | null = null;
  private pendingResolves: Map<string, (value: SerializedTechnicalsData) => void> =
    new Map();
  private pendingRejects: Map<string, (reason?: any) => void> = new Map();
  private lastActive: number = Date.now();
  private readonly IDLE_TIMEOUT = 30000; // 30s keep-alive

  getWorker(): Worker | null {
    if (!browser) return null;

    // Singleton Init
    if (!this.worker) {
      this.initWorker();
    }
    return this.worker;
  }

  private initWorker() {
    if (!browser || typeof Worker === "undefined") return;

    try {
      this.worker = new Worker(
        new URL("../workers/technicals.worker.ts", import.meta.url),
        { type: "module" }
      );
      this.worker.onmessage = this.handleMessage.bind(this);
      this.worker.onerror = this.handleError.bind(this);

      if (import.meta.env.DEV) {
        console.log("[Technicals] Worker started (Singleton).");
      }
    } catch (e) {
      console.error("[Technicals] Failed to start worker", e);
      this.worker = null;
    }
  }

  private handleMessage(e: MessageEvent) {
    const { id, payload, error } = e.data;
    if (this.pendingResolves.has(id)) {
      if (error) {
        this.pendingRejects.get(id)?.(error);
      } else {
        this.pendingResolves.get(id)?.(payload);
      }
      this.pendingResolves.delete(id);
      this.pendingRejects.delete(id);
    }
  }

  private handleError(e: ErrorEvent) {
    console.error("[Technicals] Worker Error:", e);
    // Auto-restart logic: Terminate and clear instance so next call re-initializes
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    // Reject all pending requests to trigger immediate fallback
    this.pendingRejects.forEach((reject) => reject(new Error("workerErrors.eventError")));
    this.pendingResolves.clear();
    this.pendingRejects.clear();
  }

  public async postMessage(message: any, transfer: Transferable[] = []): Promise<SerializedTechnicalsData> {
    const w = this.getWorker();
    if (!w) throw new Error("workerErrors.notAvailable");

    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pendingResolves.set(id, resolve);
      this.pendingRejects.set(id, reject);

      w.postMessage({ ...message, id }, transfer);

      // Safety timeout
      setTimeout(() => {
        if (this.pendingResolves.has(id)) {
          this.pendingRejects.get(id)?.(new Error("workerErrors.timeout"));
          this.pendingResolves.delete(id);
          this.pendingRejects.delete(id);
        }
      }, 5000);
    });
  }

  // No termination logic - Keep alive as singleton
}

const workerManager = new TechnicalsWorkerManager();

export const technicalsService = {
  async calculateTechnicals(
    klinesInput: {
      time: number;
      open: number | string | Decimal;
      high: number | string | Decimal;
      low: number | string | Decimal;
      close: number | string | Decimal;
      volume?: number | string | Decimal;
    }[],
    settings?: IndicatorSettings,
    enabledIndicators?: Partial<Record<string, boolean>>,
  ): Promise<TechnicalsData> {
    if (klinesInput.length === 0) return this.getEmptyData();

    // Cleanup stale cache every call
    cleanupStaleCache();

    // 0. Cache Check - Include enabled indicators in cache key
    const lastKline = klinesInput[klinesInput.length - 1];
    const lastPrice = lastKline.close?.toString() || "0";
    const settingsJson = JSON.stringify(settings);
    const indicatorsHash = enabledIndicators
      ? Object.entries(enabledIndicators)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name)
        .sort()
        .join(',')
      : 'all';

    const cacheKey = `${lastKline.time}-${lastPrice}-${settingsJson}-${indicatorsHash}`;

    const cached = calculationCache.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      if (import.meta.env.DEV) {
        console.log('[Technicals] Cache HIT');
      }
      return cached.data;
    }

    if (import.meta.env.DEV) {
      console.log('[Technicals] Cache MISS, calculating...');
    }

    // 1. Try Worker (Singleton)
    try {
      // 2. Prepare SoA (Struct of Arrays) for Zero-Copy Transfer
      // This is vastly reduced GC pressure compared to mapping thousands of objects
      const len = klinesInput.length;
      const times = new Float64Array(len);
      const opens = new Float64Array(len);
      const highs = new Float64Array(len);
      const lows = new Float64Array(len);
      const closes = new Float64Array(len);
      const volumes = new Float64Array(len);

      for (let i = 0; i < len; i++) {
        const k = klinesInput[i];
        times[i] = k.time;
        // Fast conversion: Use number if possible, else Decimal.toNumber()
        opens[i] = typeof k.open === 'number' ? k.open : new Decimal(k.open).toNumber();
        highs[i] = typeof k.high === 'number' ? k.high : new Decimal(k.high).toNumber();
        lows[i] = typeof k.low === 'number' ? k.low : new Decimal(k.low).toNumber();
        closes[i] = typeof k.close === 'number' ? k.close : new Decimal(k.close).toNumber();
        volumes[i] = k.volume ? (typeof k.volume === 'number' ? k.volume : new Decimal(k.volume).toNumber()) : 0;
      }

      // 3. Post Message with Transferables
      // The worker takes ownership of the buffers. We cannot use them after this.
      const result = await workerManager.postMessage({
        type: "CALCULATE",
        payload: {
          times, opens, highs, lows, closes, volumes, settings, enabledIndicators
        }
      }, [times.buffer, opens.buffer, highs.buffer, lows.buffer, closes.buffer, volumes.buffer]);

      // 2. Rehydrate Decimals (Worker returns Serialized Data)
      const rehydrated = this.deserializeTechnicalsData(result);

      // Cache result with aggressive eviction
      if (calculationCache.size >= MAX_CACHE_SIZE) {
        // Find oldest entry by lastAccessed time
        let oldestKey: string | null = null;
        let oldestTime = Infinity;

        calculationCache.forEach((entry, key) => {
          const accessTime = entry.lastAccessed || entry.timestamp;
          if (accessTime < oldestTime) {
            oldestTime = accessTime;
            oldestKey = key;
          }
        });

        if (oldestKey) {
          calculationCache.delete(oldestKey);
        }
      }
      calculationCache.set(cacheKey, {
        data: rehydrated,
        timestamp: Date.now(),
        lastAccessed: Date.now()
      });

      return rehydrated;
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[Technicals] Worker failed, falling back to inline", e);
      return this.calculateTechnicalsInline(klinesInput, settings, enabledIndicators);
    }
  },

  calculateTechnicalsInline(
    klinesInput: {
      time: number;
      open: number | string | Decimal;
      high: number | string | Decimal;
      low: number | string | Decimal;
      close: number | string | Decimal;
      volume?: number | string | Decimal;
    }[],
    settings?: IndicatorSettings,
    enabledIndicators?: Partial<Record<string, boolean>>,
  ): TechnicalsData {
    // 1. Cache check first (same as async version)
    const lastKline = klinesInput[klinesInput.length - 1];
    const lastPrice = lastKline.close?.toString() || "0";
    const settingsJson = JSON.stringify(settings);
    const indicatorsHash = enabledIndicators
      ? Object.entries(enabledIndicators)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name)
        .sort()
        .join(',')
      : 'all';
    const cacheKey = `${lastKline.time}-${lastPrice}-${settingsJson}-${indicatorsHash}`;

    const cached = calculationCache.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      if (import.meta.env.DEV) {
        console.log('[Technicals] Inline Cache HIT');
      }
      return cached.data;
    }

    // 2. Normalize Data to strict Kline format with Decimals
    const klines: Kline[] = [];
    let prevClose = new Decimal(0);

    const toDec = (
      val: any,
      fallback: Decimal,
    ): Decimal => {
      if (val instanceof Decimal) return val;
      if (val && typeof val === 'object' && val.s !== undefined) return new Decimal(val);
      if (typeof val === "number" && !isNaN(val)) return new Decimal(val);
      if (typeof val === "string") return new Decimal(val);
      return fallback;
    };

    klinesInput.forEach((k) => {
      const time = k.time;
      const close = toDec(k.close, prevClose);
      const safeClose =
        close.isZero() && !prevClose.isZero() ? prevClose : close;
      const open = toDec(k.open, safeClose);
      const high = toDec(k.high, safeClose);
      const low = toDec(k.low, safeClose);
      const volume = toDec(k.volume, new Decimal(0));

      if (!safeClose.isZero()) {
        klines.push({ open, high, low, close: safeClose, volume, time });
        prevClose = safeClose;
      }
    });

    // Use Shared Calculator with enabled indicators filter
    const result = calculateAllIndicators(klines, settings, enabledIndicators);

    // Store in cache with aggressive eviction
    if (calculationCache.size >= MAX_CACHE_SIZE) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      calculationCache.forEach((entry, key) => {
        const accessTime = entry.lastAccessed || entry.timestamp;
        if (accessTime < oldestTime) {
          oldestTime = accessTime;
          oldestKey = key;
        }
      });

      if (oldestKey) {
        calculationCache.delete(oldestKey);
      }
    }
    calculationCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
      lastAccessed: Date.now()
    });

    return result;
  },

  deserializeTechnicalsData(data: SerializedTechnicalsData): TechnicalsData {
    const toDec = (v: string | undefined): Decimal => v ? new Decimal(v) : new Decimal(0);

    return {
      oscillators: data.oscillators.map(o => ({
        ...o,
        value: toDec(o.value),
        signal: o.signal ? new Decimal(o.signal) : undefined,
        histogram: o.histogram ? new Decimal(o.histogram) : undefined,
      })),
      movingAverages: data.movingAverages.map(m => ({
        ...m,
        value: toDec(m.value),
        signal: m.signal ? new Decimal(m.signal) : undefined,
        histogram: m.histogram ? new Decimal(m.histogram) : undefined,
      })),
      pivots: {
        classic: {
          p: toDec(data.pivots.classic.p),
          r1: toDec(data.pivots.classic.r1),
          r2: toDec(data.pivots.classic.r2),
          r3: toDec(data.pivots.classic.r3),
          s1: toDec(data.pivots.classic.s1),
          s2: toDec(data.pivots.classic.s2),
          s3: toDec(data.pivots.classic.s3),
        }
      },
      pivotBasis: data.pivotBasis ? {
        high: toDec(data.pivotBasis.high),
        low: toDec(data.pivotBasis.low),
        close: toDec(data.pivotBasis.close),
        open: toDec(data.pivotBasis.open),
      } : undefined,
      summary: data.summary,
      volatility: data.volatility ? {
        atr: toDec(data.volatility.atr),
        bb: {
          upper: toDec(data.volatility.bb.upper),
          middle: toDec(data.volatility.bb.middle),
          lower: toDec(data.volatility.bb.lower),
          percentP: toDec(data.volatility.bb.percentP),
        }
      } : undefined,
      divergences: data.divergences?.map(d => ({
        ...d,
        priceStart: toDec(d.priceStart),
        priceEnd: toDec(d.priceEnd),
        indStart: toDec(d.indStart),
        indEnd: toDec(d.indEnd),
      })),
      confluence: data.confluence,
      advanced: data.advanced ? {
        vwap: data.advanced.vwap ? toDec(data.advanced.vwap) : undefined,
        mfi: data.advanced.mfi ? {
          value: toDec(data.advanced.mfi.value),
          action: data.advanced.mfi.action
        } : undefined,
        stochRsi: data.advanced.stochRsi ? {
          k: toDec(data.advanced.stochRsi.k),
          d: toDec(data.advanced.stochRsi.d),
          action: data.advanced.stochRsi.action
        } : undefined,
        williamsR: data.advanced.williamsR ? {
          value: toDec(data.advanced.williamsR.value),
          action: data.advanced.williamsR.action
        } : undefined,
        choppiness: data.advanced.choppiness ? {
          value: toDec(data.advanced.choppiness.value),
          state: data.advanced.choppiness.state
        } : undefined,
        ichimoku: data.advanced.ichimoku ? {
          conversion: toDec(data.advanced.ichimoku.conversion),
          base: toDec(data.advanced.ichimoku.base),
          spanA: toDec(data.advanced.ichimoku.spanA),
          spanB: toDec(data.advanced.ichimoku.spanB),
          action: data.advanced.ichimoku.action
        } : undefined,
        parabolicSar: data.advanced.parabolicSar ? toDec(data.advanced.parabolicSar) : undefined,
        superTrend: data.advanced.superTrend ? {
          value: toDec(data.advanced.superTrend.value),
          trend: data.advanced.superTrend.trend
        } : undefined,
        atrTrailingStop: data.advanced.atrTrailingStop ? {
          buy: toDec(data.advanced.atrTrailingStop.buy),
          sell: toDec(data.advanced.atrTrailingStop.sell)
        } : undefined,
        obv: data.advanced.obv ? toDec(data.advanced.obv) : undefined,
        volumeProfile: data.advanced.volumeProfile ? {
          poc: toDec(data.advanced.volumeProfile.poc),
          vaHigh: toDec(data.advanced.volumeProfile.vaHigh),
          vaLow: toDec(data.advanced.volumeProfile.vaLow),
          rows: data.advanced.volumeProfile.rows.map(r => ({
            priceStart: toDec(r.priceStart),
            priceEnd: toDec(r.priceEnd),
            volume: toDec(r.volume)
          }))
        } : undefined,
      } : undefined
    };
  },

  getEmptyData(): TechnicalsData {
    return getEmptyData();
  },
};
