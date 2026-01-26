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
import type { TechnicalsData, IndicatorResult } from "./technicalsTypes";
import { type Kline } from "../utils/indicators";
import {
  calculateAllIndicators,
  getEmptyData,
} from "../utils/technicalsCalculator";

export { JSIndicators } from "../utils/indicators";
export type { Kline, TechnicalsData, IndicatorResult };

// Cache for indicator calculations - Dynamic configuration from settings
let MAX_CACHE_SIZE = 15;
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
    this.pendingRejects.forEach((reject) => reject(new Error("Worker Error Event")));
    this.pendingResolves.clear();
    this.pendingRejects.clear();
  }

  public async postMessage(message: any): Promise<TechnicalsData> {
    const w = this.getWorker();
    if (!w) throw new Error("Worker not available");

    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pendingResolves.set(id, resolve);
      this.pendingRejects.set(id, reject);

      w.postMessage({ ...message, id });

      // Safety timeout
      setTimeout(() => {
        if (this.pendingResolves.has(id)) {
          this.pendingRejects.get(id)?.(new Error("Worker Timeout"));
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
      const serializedKlines = klinesInput.map(k => ({
        time: k.time,
        open: k.open instanceof Decimal ? parseFloat(k.open.toString()) : parseFloat(String(k.open)),
        high: k.high instanceof Decimal ? parseFloat(k.high.toString()) : parseFloat(String(k.high)),
        low: k.low instanceof Decimal ? parseFloat(k.low.toString()) : parseFloat(String(k.low)),
        close: k.close instanceof Decimal ? parseFloat(k.close.toString()) : parseFloat(String(k.close)),
        volume: k.volume ? (k.volume instanceof Decimal ? parseFloat(k.volume.toString()) : parseFloat(String(k.volume))) : 0,
      }));

      const result = await workerManager.postMessage({
        type: "CALCULATE",
        klines: serializedKlines,
        settings,
        enabledIndicators
      });

      // 2. Rehydrate Decimals (Worker returns POJOs)
      const rehydrated = this.rehydrateDecimals(result);

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
          if (import.meta.env.DEV) {
            console.log('[Technicals] Evicted LRU cache entry');
          }
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
      settings ?: IndicatorSettings,
      enabledIndicators ?: Partial<Record<string, boolean>>,
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

    /**
     * Recursively converts plain objects that look like serialized Decimals 
     * (containing s, e, c properties) back into Decimal instances.
     */
    rehydrateDecimals(obj: any): any {
      if (obj === null || obj === undefined) return obj;

      // Check if it's already a Decimal (or a Proxy of one that behaves like one)
      if (obj instanceof Decimal || (obj && typeof obj === 'object' && obj.toDecimalPlaces)) {
        return obj;
      }

      // Check if it's a serialized Decimal: { s: number, e: number, c: number[] }
      // We check for 'c' and 's' which are core to Decimal.js internal state
      if (typeof obj === 'object' && obj.s !== undefined && obj.c !== undefined && Array.isArray(obj.c)) {
        try {
          return new Decimal(obj);
        } catch (e) {
          return obj;
        }
      }

      if (Array.isArray(obj)) {
        return obj.map(item => this.rehydrateDecimals(item));
      }

      if (typeof obj === 'object') {
        // Create a fresh object to avoid Proxy issues
        const result: any = {};
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result[key] = this.rehydrateDecimals(obj[key]);
          }
        }
        return result;
      }

      return obj;
    },

    getEmptyData(): TechnicalsData {
      return getEmptyData();
    },
  };
