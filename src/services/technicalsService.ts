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
import type { IndicatorSettings } from "../stores/indicator.svelte";
import type { TechnicalsData, IndicatorResult } from "./technicalsTypes";
import { type Kline } from "../utils/indicators";
import { calculateAllIndicators, getEmptyData } from "../utils/technicalsCalculator";

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
  private pendingResolves: Map<string, (value: TechnicalsData) => void> = new Map();
  private pendingRejects: Map<string, (reason?: any) => void> = new Map();
  private checkInterval: any = null;
  private lastActive: number = Date.now();
  private readonly IDLE_TIMEOUT = 60000; // 1 min

  getWorker(): Worker | null {
    if (!browser) return null;

    // Revive if missing
    if (!this.worker) {
      this.initWorker();
    }
    return this.worker;
  }

  private initWorker() {
    if (!browser || typeof Worker === 'undefined') return;

    try {
      this.worker = new Worker(new URL('../workers/technicals.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = this.handleMessage.bind(this);
      this.worker.onerror = this.handleError.bind(this);
      this.lastActive = Date.now();

      // Watchdog
      if (!this.checkInterval) {
        this.checkInterval = setInterval(() => this.checkIdle(), 10000);
      }
    } catch (e) {
    }
  }

  private checkIdle() {
    if (this.worker && this.pendingResolves.size === 0 && Date.now() - this.lastActive > this.IDLE_TIMEOUT) {
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

  private handleMessage(e: MessageEvent) {
    this.lastActive = Date.now();
    const { type, payload, error, id } = e.data;
    if (id && this.pendingResolves.has(id)) {
      if (type === "RESULT") {
        try {
          const hydrated = this.rehydrate(payload);
          this.pendingResolves.get(id)!(hydrated);
        } catch (err) {
          this.pendingRejects.get(id)!(err);
        }
      } else {
        const reject = this.pendingRejects.get(id);
        if (reject) reject(error);
      }
      this.pendingResolves.delete(id);
      this.pendingRejects.delete(id);
    }
  }

  // Helper to hydrate serialized data back to Decimal
  private rehydrate(data: any): TechnicalsData {
    if (data.oscillators) data.oscillators.forEach((o: any) => o.value = new Decimal(o.value || 0));
    if (data.movingAverages) data.movingAverages.forEach((m: any) => m.value = new Decimal(m.value || 0));

    const rehydratePivots = (p: any) => {
      const c = p.classic;
      return {
        classic: {
          p: new Decimal(c.p), r1: new Decimal(c.r1), r2: new Decimal(c.r2), r3: new Decimal(c.r3),
          s1: new Decimal(c.s1), s2: new Decimal(c.s2), s3: new Decimal(c.s3)
        }
      };
    };
    if (data.pivots) data.pivots = rehydratePivots(data.pivots);
    if (data.pivotBasis) {
      data.pivotBasis.high = new Decimal(data.pivotBasis.high);
      data.pivotBasis.low = new Decimal(data.pivotBasis.low);
      data.pivotBasis.open = new Decimal(data.pivotBasis.open);
      data.pivotBasis.close = new Decimal(data.pivotBasis.close);
    }

    // Rehydrate Volatility
    if (data.volatility) {
      data.volatility.atr = new Decimal(data.volatility.atr);
      data.volatility.bb.upper = new Decimal(data.volatility.bb.upper);
      data.volatility.bb.middle = new Decimal(data.volatility.bb.middle);
      data.volatility.bb.lower = new Decimal(data.volatility.bb.lower);
      data.volatility.bb.percentP = new Decimal(data.volatility.bb.percentP);
    }

    // Rehydrate Divergences
    if (data.divergences) {
      data.divergences = data.divergences.map((d: any) => ({
        ...d,
        priceStart: new Decimal(d.priceStart),
        priceEnd: new Decimal(d.priceEnd),
        indStart: new Decimal(d.indStart || 0), // Handle potential missing fields gracefully
        indEnd: new Decimal(d.indEnd || 0)
      }));
    }

    // Rehydrate Advanced
    if (data.advanced) {
      if (data.advanced.vwap) data.advanced.vwap = new Decimal(data.advanced.vwap);
      if (data.advanced.mfi) data.advanced.mfi.value = new Decimal(data.advanced.mfi.value);
      if (data.advanced.stochRsi) {
        data.advanced.stochRsi.k = new Decimal(data.advanced.stochRsi.k);
        data.advanced.stochRsi.d = new Decimal(data.advanced.stochRsi.d);
      }
      if (data.advanced.williamsR) data.advanced.williamsR.value = new Decimal(data.advanced.williamsR.value);
      if (data.advanced.choppiness) data.advanced.choppiness.value = new Decimal(data.advanced.choppiness.value);
      if (data.advanced.ichimoku) {
        data.advanced.ichimoku.conversion = new Decimal(data.advanced.ichimoku.conversion);
        data.advanced.ichimoku.base = new Decimal(data.advanced.ichimoku.base);
        data.advanced.ichimoku.spanA = new Decimal(data.advanced.ichimoku.spanA);
        data.advanced.ichimoku.spanB = new Decimal(data.advanced.ichimoku.spanB);
      }
      if (data.advanced.parabolicSar) data.advanced.parabolicSar = new Decimal(data.advanced.parabolicSar);

      // Phase 5: Pro Rehydration
      if (data.advanced.superTrend) {
        data.advanced.superTrend.value = new Decimal(data.advanced.superTrend.value);
      }
      if (data.advanced.atrTrailingStop) {
        data.advanced.atrTrailingStop.buy = new Decimal(data.advanced.atrTrailingStop.buy);
        data.advanced.atrTrailingStop.sell = new Decimal(data.advanced.atrTrailingStop.sell);
      }
      if (data.advanced.obv) data.advanced.obv = new Decimal(data.advanced.obv);
      if (data.advanced.volumeProfile) {
        data.advanced.volumeProfile.poc = new Decimal(data.advanced.volumeProfile.poc);
        data.advanced.volumeProfile.vaHigh = new Decimal(data.advanced.volumeProfile.vaHigh);
        data.advanced.volumeProfile.vaLow = new Decimal(data.advanced.volumeProfile.vaLow);
        data.advanced.volumeProfile.rows = data.advanced.volumeProfile.rows.map((r: any) => ({
          priceStart: new Decimal(r.priceStart),
          priceEnd: new Decimal(r.priceEnd),
          volume: new Decimal(r.volume)
        }));
      }
    }

    return data as TechnicalsData;
  }

  private handleError(e: ErrorEvent) {
    // Reject all pending
    this.pendingRejects.forEach(reject => reject(e.message));
    this.pendingResolves.clear();
    this.pendingRejects.clear();
    // Restart worker next time
    this.terminate();
  }

  public async calculate(payload: any): Promise<TechnicalsData> {
    const worker = this.getWorker();
    if (!worker) {
      throw new Error("Worker not available");
    }

    const id = Date.now().toString() + Math.random().toString();

    return new Promise((resolve, reject) => {
      // 30s Timeout (Robustness Fix)
      const timeout = setTimeout(() => {
        if (this.pendingResolves.has(id)) {
          this.pendingResolves.delete(id);
          this.pendingRejects.delete(id);
          reject(new Error("Worker Timeout"));
        }
      }, 30000);

      this.pendingResolves.set(id, (data) => {
        clearTimeout(timeout);
        resolve(data);
      });

      this.pendingRejects.set(id, (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      worker.postMessage({ type: "CALCULATE", payload, id });
    });
  }
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

    // Prepare Serializable Data
    const klinesSerializable = klinesInput.map(k => ({
      time: k.time,
      open: k.open.toString(),
      high: k.high.toString(),
      low: k.low.toString(),
      close: k.close.toString(),
      volume: (k.volume || 0).toString()
    }));
    const cleanSettings = JSON.parse(JSON.stringify(settings || {}));

    // --- Worker Offloading ---
    if (browser && window.Worker) {
      try {
        const result = await workerManager.calculate({ klines: klinesSerializable, settings: cleanSettings });
        calculationCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      } catch (e) {
        // Fallback continues below
      }
    }

    // Fallback or SSR
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
  }
};

