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
  private checkInterval: any = null;
  private lastActive: number = Date.now();
  private readonly IDLE_TIMEOUT = 5000; // 5s

  getWorker(): Worker | null {
    if (!browser) return null;
    // Revive if missing (currently disabled)
    // if (!this.worker) { this.initWorker(); }
    return this.worker;
  }

  /*
  private initWorker() {
    // DISABLED: Worker causes memory leak.
    if (!browser || typeof Worker === "undefined") return;

    try {
      this.worker = new Worker(
        new URL("../workers/technicals.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = this.handleMessage.bind(this);
      this.worker.onerror = this.handleError.bind(this);
      this.lastActive = Date.now();

      // Watchdog
      if (!this.checkInterval) {
        this.checkInterval = setInterval(() => this.checkIdle(), 10000);
      }
    } catch (e) {}
  }
  */

  private checkIdle() {
    if (
      this.worker &&
      this.pendingResolves.size === 0 &&
      Date.now() - this.lastActive > this.IDLE_TIMEOUT
    ) {
      this.terminate();
    }
  }

  private terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingResolves.clear();
    this.pendingRejects.clear();
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // ... (handleMessage, rehydrate, etc. omitted for brevity if not used)
  // Keeping class structure for future re-enablement if needed, but methods are largely dormant.
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

    // Worker is DISABLED to prevent leaks.
    // Proceed directly to inline calculation.
    return this.calculateTechnicalsInline(klinesInput, settings);
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

  getEmptyData(): TechnicalsData {
    return getEmptyData();
  },
};
