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
 * Market Analyst Service
 * Background service that cycles through favorite symbols to calculate
 * key indicators without overloading the CPU or API.
 */

import { Decimal } from "decimal.js";
import { browser } from "$app/environment";
import type { IndicatorSettings } from "../stores/indicator.svelte";
import type { TechnicalsData, IndicatorResult, SerializedTechnicalsData, KlineBuffers } from "./technicalsTypes";
import { type Kline } from "../utils/indicators";
import {
  calculateAllIndicators,
  calculateIndicatorsFromArrays,
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
  private pendingResolves: Map<string, (value: TechnicalsData) => void> =
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

  public async postMessage(message: any, transfer: Transferable[] = []): Promise<TechnicalsData> {
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

const INDICATOR_SETTINGS_MAP: Record<string, string> = {
  'rsi': 'rsi',
  'stochastic': 'stochastic',
  'cci': 'cci',
  'adx': 'adx',
  'ao': 'ao',
  'macd': 'macd',
  'stochrsi': 'stochRsi',
  'williamsr': 'williamsR',
  'supertrend': 'superTrend',
  'atrtrailingstop': 'atrTrailingStop',
  'obv': 'obv',
  'volumeprofile': 'volumeProfile',
  'vwap': 'vwap',
  'parabolicsar': 'parabolicSar',
  'mfi': 'mfi',
  'choppiness': 'choppiness',
  'ichimoku': 'ichimoku',
  'ema': 'ema',
  'pivots': 'pivots',
  'atr': 'atr',
  'bb': 'bb',
  'momentum': 'momentum',
  'volumema': 'volumeMa',
  'bollingerbands': 'bollingerBands'
};

function generateCacheKey(
  lastTime: number,
  lastPriceStr: string,
  len: number,
  firstTime: number,
  settings: any,
  enabledIndicators?: Partial<Record<string, boolean>>
): string {
  // Static parts
  const prefix = `${lastTime}_${lastPriceStr}_${len}_${firstTime}`;

  if (!enabledIndicators) {
    return prefix + '_ALL_' + JSON.stringify(settings);
  }

  // Optimize: Normalize and determine active indicators
  const lowerEnabled: Record<string, boolean> = {};
  let hasTrue = false;
  for (const k in enabledIndicators) {
    const v = enabledIndicators[k];
    if (v !== undefined) {
      lowerEnabled[k.toLowerCase()] = v;
      if (v === true) hasTrue = true;
    }
  }

  const activeKeys: string[] = [];
  if (hasTrue) {
    // Allowlist mode
    for (const k in lowerEnabled) {
      if (lowerEnabled[k] === true) activeKeys.push(k);
    }
  } else {
    // Blocklist mode (include all except disabled)
    const allInds = Object.keys(INDICATOR_SETTINGS_MAP);
    for (const ind of allInds) {
      if (lowerEnabled[ind] !== false) {
        activeKeys.push(ind);
      }
    }
  }

  // Sort for determinism (important for JSON stringify order if relies on insertion order)
  activeKeys.sort();

  // Construct a minimal object to stringify
  // This combines indicators hash and settings hash into one operation
  const payload: any = {};

  if (settings) {
      payload._h = settings.historyLimit;
      payload._p = settings.precision;

      for (const indName of activeKeys) {
          const settingKey = INDICATOR_SETTINGS_MAP[indName];
          if (settingKey && settings[settingKey]) {
             payload[settingKey] = settings[settingKey];
          }
      }
  }

  return prefix + '_' + JSON.stringify(payload);
}

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

    const cacheKey = generateCacheKey(
        lastKline.time,
        lastPrice,
        klinesInput.length,
        klinesInput[0].time,
        settings,
        enabledIndicators
    );

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

      // Helper for fast and safe conversion
      const toNumFast = (val: any): number => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
           const p = parseFloat(val);
           return isNaN(p) ? 0 : p;
        }
        if (val instanceof Decimal) return val.toNumber();
        // Duck typing for Decimal-like objects to avoid try/catch
        if (val && typeof val === 'object' && (val as any).s !== undefined && (val as any).e !== undefined) {
            return new Decimal(val).toNumber();
        }
        try { return new Decimal(val).toNumber(); } catch { return 0; }
      };

      for (let i = 0; i < len; i++) {
        const k = klinesInput[i];
        times[i] = k.time;
        opens[i] = toNumFast(k.open);
        highs[i] = toNumFast(k.high);
        lows[i] = toNumFast(k.low);
        closes[i] = toNumFast(k.close);
        volumes[i] = k.volume ? toNumFast(k.volume) : 0;
      }

      // 3. Post Message with Transferables
      // The worker takes ownership of the buffers. We cannot use them after this.
      const result = await workerManager.postMessage({
        type: "CALCULATE",
        payload: {
          times, opens, highs, lows, closes, volumes, settings, enabledIndicators
        }
      }, [times.buffer, opens.buffer, highs.buffer, lows.buffer, closes.buffer, volumes.buffer]);

      // Optimization: No deserialization needed, result is directly TechnicalsData with numbers
      const finalResult = result;

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
        data: finalResult,
        timestamp: Date.now(),
        lastAccessed: Date.now()
      });

      return finalResult;
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[Technicals] Worker failed, falling back to inline", e);
      return this.calculateTechnicalsInline(klinesInput, settings, enabledIndicators);
    }
  },

  async calculateTechnicalsFromBuffers(
    buffers: KlineBuffers,
    settings?: IndicatorSettings,
    enabledIndicators?: Partial<Record<string, boolean>>,
  ): Promise<TechnicalsData> {
    const len = buffers.times.length;
    if (len === 0) return this.getEmptyData();

    cleanupStaleCache();

    // 0. Cache Check
    const lastTime = buffers.times[len - 1];
    const lastClose = buffers.closes[len - 1];
    const lastPrice = lastClose.toString(); // float to string might vary slightly but usually deterministic for same float

    const cacheKey = generateCacheKey(
        lastTime,
        lastPrice,
        len,
        buffers.times[0],
        settings,
        enabledIndicators
    );

    const cached = calculationCache.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      if (import.meta.env.DEV) console.log('[Technicals] Buffered Cache HIT');
      return cached.data;
    }

    // 1. Worker
    try {
      const { times, opens, highs, lows, closes, volumes } = buffers;

      // IMPORTANT: We assume 'buffers' are owned by the caller and can be transferred.
      // If the caller needs to reuse them, they should have cloned them.
      // We pass the underlying ArrayBuffers to the worker.
      const transferables = [
        times.buffer, opens.buffer, highs.buffer, lows.buffer, closes.buffer, volumes.buffer
      ];

      const result = await workerManager.postMessage({
        type: "CALCULATE",
        payload: {
          times, opens, highs, lows, closes, volumes, settings, enabledIndicators
        }
      }, transferables);

      // Cache result
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
        if (oldestKey) calculationCache.delete(oldestKey);
      }
      calculationCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
        lastAccessed: Date.now()
      });

      return result;

    } catch (e) {
      if (import.meta.env.DEV) console.warn("[Technicals] Buffer Worker failed, falling back to inline", e);
      // Fallback: Use inline calculator with buffers directly
      // Note: buffers might be unusable if transfer failed?
      // Actually if transfer failed, they are still here. If transfer succeeded but worker errored, they are gone.
      // But typically worker error returns data.
      // We'll try inline.
      return calculateIndicatorsFromArrays(
        buffers.times, buffers.opens, buffers.highs, buffers.lows, buffers.closes, buffers.volumes,
        settings, enabledIndicators
      );
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

    const cacheKey = generateCacheKey(
        lastKline.time,
        lastPrice,
        klinesInput.length,
        klinesInput[0].time,
        settings,
        enabledIndicators
    );

    const cached = calculationCache.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      if (import.meta.env.DEV) {
        console.log('[Technicals] Inline Cache HIT');
      }
      return cached.data;
    }

    // 2. Prepare Arrays directly (Fast Path)
    // Avoid creating thousands of Decimal objects and Kline objects
    // Optimization: Use Float64Array for faster access and reduced GC
    const len = klinesInput.length;
    const times = new Float64Array(len);
    const opens = new Float64Array(len);
    const highs = new Float64Array(len);
    const lows = new Float64Array(len);
    const closes = new Float64Array(len);
    const volumes = new Float64Array(len);

    let prevClose = 0;
    let writeIdx = 0;

    // Helper for fields other than close
    const getVal = (v: any, fallback: number): number => {
        if (typeof v === 'number') return isNaN(v) ? fallback : v;
        if (typeof v === 'string') { const p = parseFloat(v); return isNaN(p) ? fallback : p; }
        if (v instanceof Decimal) return v.toNumber();
        if (v && typeof v === 'object' && (v as any).s !== undefined) return new Decimal(v).toNumber();
        return fallback;
    };

    for (let i = 0; i < len; i++) {
        const k = klinesInput[i];

        // Inline toNum logic for 'close' with prevClose fallback
        const valC = k.close;
        let close: number;
        if (typeof valC === 'number') {
            close = valC;
        } else if (typeof valC === 'string') {
            const p = parseFloat(valC);
            close = isNaN(p) ? prevClose : p;
        } else if (valC instanceof Decimal) {
             close = valC.toNumber();
        } else if (valC && typeof valC === 'object' && (valC as any).s !== undefined) {
             close = new Decimal(valC).toNumber();
        } else {
             close = prevClose;
        }

        if (isNaN(close)) close = prevClose;

        // Data cleaning: If close is 0 and we have a previous close, use that.
        const safeClose = (close === 0 && prevClose !== 0) ? prevClose : close;

        if (safeClose !== 0) {
            times[writeIdx] = k.time;
            closes[writeIdx] = safeClose;

            opens[writeIdx] = getVal(k.open, safeClose);
            highs[writeIdx] = getVal(k.high, safeClose);
            lows[writeIdx] = getVal(k.low, safeClose);
            volumes[writeIdx] = getVal(k.volume, 0);

            writeIdx++;
            prevClose = safeClose;
        }
    }

    // If we filtered out bad data, we need to slice the arrays
    let finalTimes, finalOpens, finalHighs, finalLows, finalCloses, finalVolumes;
    if (writeIdx < len) {
        finalTimes = times.subarray(0, writeIdx);
        finalOpens = opens.subarray(0, writeIdx);
        finalHighs = highs.subarray(0, writeIdx);
        finalLows = lows.subarray(0, writeIdx);
        finalCloses = closes.subarray(0, writeIdx);
        finalVolumes = volumes.subarray(0, writeIdx);
    } else {
        finalTimes = times;
        finalOpens = opens;
        finalHighs = highs;
        finalLows = lows;
        finalCloses = closes;
        finalVolumes = volumes;
    }

    // Use Shared Calculator with enabled indicators filter directly on arrays
    const result = calculateIndicatorsFromArrays(
        finalTimes, finalOpens, finalHighs, finalLows, finalCloses, finalVolumes,
        settings, enabledIndicators
    );

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

  getEmptyData(): TechnicalsData {
    return getEmptyData();
  },
};
