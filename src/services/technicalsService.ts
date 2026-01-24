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

// Cache for indicator calculations
const calculationCache = new Map<string, TechnicalsResultCacheEntry>();
const MAX_CACHE_SIZE = 20;

interface TechnicalsResultCacheEntry {
  data: TechnicalsData;
  timestamp: number;
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
    const { id, data, error } = e.data;
    if (this.pendingResolves.has(id)) {
      if (error) {
        this.pendingRejects.get(id)?.(error);
      } else {
        this.pendingResolves.get(id)?.(data);
      }
      this.pendingResolves.delete(id);
      this.pendingRejects.delete(id);
    }
  }

  private handleError(e: ErrorEvent) {
    console.error("[Technicals] Worker Error:", e);
    // Don't kill immediately, but maybe restart if it happens often?
    // For now, let it be.
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
  ): Promise<TechnicalsData> {
    if (klinesInput.length === 0) return this.getEmptyData();

    // 0. Cache Check
    const lastKline = klinesInput[klinesInput.length - 1];
    const lastPrice = lastKline.close?.toString() || "0";
    const cacheKey = `${klinesInput.length}-${lastKline.time}-${lastPrice}-${JSON.stringify(
      settings,
    )}`;
    const cached = calculationCache.get(cacheKey);
    if (cached) {
      return cached.data;
    }

    // 1. Try Walker (Singleton)
    try {
      const serializedKlines = klinesInput.map(k => ({
        ...k,
        open: k.open.toString(),
        high: k.high.toString(),
        low: k.low.toString(),
        close: k.close.toString(),
        volume: k.volume?.toString() || "0"
      }));

      const result = await workerManager.postMessage({
        type: "CALCULATE",
        klines: serializedKlines,
        settings
      });

      // 2. Rehydrate Decimals (Worker returns POJOs)
      const rehydrated = this.rehydrateDecimals(result);

      // Cache result
      if (calculationCache.size >= MAX_CACHE_SIZE) {
        const firstKey = calculationCache.keys().next().value;
        if (firstKey) calculationCache.delete(firstKey);
      }
      calculationCache.set(cacheKey, { data: rehydrated, timestamp: Date.now() });

      return rehydrated;
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[Technicals] Worker failed, falling back to inline", e);
      return this.calculateTechnicalsInline(klinesInput, settings);
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
  ): TechnicalsData {
    // 1. Normalize Data to strict Kline format with Decimals
    const klines: Kline[] = [];
    let prevClose = new Decimal(0);
    const lastKline = klinesInput[klinesInput.length - 1];
    const lastPrice = lastKline.close?.toString() || "0";
    const cacheKey = `${klinesInput.length}-${lastKline.time}-${lastPrice}-${JSON.stringify(
      settings,
    )}`;

    const toDec = (
      val: number | string | Decimal | undefined,
      fallback: Decimal,
    ): Decimal => {
      if (val instanceof Decimal) return val;
      if (typeof val === "number" && !isNaN(val)) return new Decimal(val);
      if (typeof val === "string") {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) return new Decimal(val);
      }
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

    // Use Shared Calculator
    const result = calculateAllIndicators(klines, settings);

    // Store in cache
    if (calculationCache.size >= MAX_CACHE_SIZE) {
      const firstKey = calculationCache.keys().next().value;
      if (firstKey) calculationCache.delete(firstKey);
    }
    calculationCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  },

  /**
   * Recursively converts plain objects that look like serialized Decimals 
   * (containing s, e, c properties) back into Decimal instances.
   */
  rehydrateDecimals(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    // Check if it's a serialized Decimal: { s: number, e: number, c: number[] }
    if (typeof obj === 'object' && obj.s !== undefined && obj.e !== undefined && obj.c !== undefined) {
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
