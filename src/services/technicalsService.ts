/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/*
 * Copyright (C) 2026 MYDCT
 *
 * Technicals Service
 * Manages the lifecycle of the technical indicators worker and 
 * provides high-performance calculation routing.
 */

import { Decimal } from "decimal.js";
import { browser } from "$app/environment";
import { logger } from "./logger";
import type { IndicatorSettings } from "../types/indicators";
import { indicatorState } from "../stores/indicator.svelte";
import type { Kline, TechnicalsData, IndicatorResult, KlineBuffers } from "./technicalsTypes";
import { getEmptyData } from "./technicalsTypes";
import { toNumFast } from "../utils/fastConversion";
import { calculationStrategy } from "./calculationStrategy";
import { calculateAllIndicators } from "../utils/technicalsCalculator";
import { getCapabilities } from "./capabilityDetection";
import { toastService } from "./toastService.svelte";

export { JSIndicators } from "../utils/indicators";
export type { Kline, TechnicalsData, IndicatorResult };

let MAX_CACHE_SIZE = 100;
let CACHE_TTL_MS = 60 * 1000;

export function updateCacheSettings(cacheSize: number, cacheTTL: number) {
  MAX_CACHE_SIZE = cacheSize;
  CACHE_TTL_MS = cacheTTL * 1000;
}

const calculationCache = new Map<string, TechnicalsResultCacheEntry>();

interface TechnicalsResultCacheEntry {
  data: TechnicalsData;
  timestamp: number;
  lastAccessed: number;
}

let lastCleanupTime = 0;
const CLEANUP_INTERVAL_MS = 30000;

function cleanupStaleCache() {
  const now = Date.now();
  if (now - lastCleanupTime < CLEANUP_INTERVAL_MS) return;
  lastCleanupTime = now;
  const staleKeys: string[] = [];
  calculationCache.forEach((entry, key) => {
    if (now - entry.timestamp > CACHE_TTL_MS) staleKeys.push(key);
  });
  staleKeys.forEach(key => calculationCache.delete(key));
}

// --- Worker Manager (Singleton) ---
class TechnicalsWorkerManager {
  private worker: Worker | null = null;
  private pendingResolves: Map<string, (value: { data: TechnicalsData; buffers?: KlineBuffers }) => void> = new Map();
  private pendingRejects: Map<string, (reason?: any) => void> = new Map();
  private consecutiveFailures = 0;
  private isDisabled = false;

  getWorker(): Worker | null {
    if (!browser || this.isDisabled) return null;
    if (!this.worker) this.initWorker();
    return this.worker;
  }

  private initWorker() {
    if (!browser) return;
    try {
      // name property for easier debugging in browser tools
      this.worker = new Worker(new URL("../workers/technicals.worker.ts", import.meta.url), { 
        type: "module",
        name: "TechnicalsWorker"
      });
      
      this.worker.onmessage = this.handleMessage.bind(this);
      this.worker.onerror = this.handleError.bind(this);
      
      logger.debug('technicals', "Worker instance created.");
    } catch (e) {
      logger.error('technicals', "Worker Creation Failed", e);
      this.isDisabled = true;
    }
  }

  private handleMessage(e: MessageEvent) {
    const { id, payload, error, buffers } = e.data;
    if (id && this.pendingResolves.has(id)) {
      if (error) {
          this.pendingRejects.get(id)?.(new Error(error));
      } else {
          this.consecutiveFailures = 0; // Reset on success
          this.pendingResolves.get(id)?.({ data: payload, buffers });
      }
      this.pendingResolves.delete(id);
      this.pendingRejects.delete(id);
    }
  }

  private handleError(e: ErrorEvent) {
    // Suppress console spam if already failing
    if (this.isDisabled) return;

    const errorMsg = e.message || "Evaluation Error or COEP/CORS Block";
    logger.error('technicals', `Worker Crash: ${errorMsg}`, e);
    
    if (this.worker) { 
        this.worker.terminate(); 
        this.worker = null; 
    }
    
    this.consecutiveFailures++;
    if (this.consecutiveFailures > 2) {
        logger.warn('technicals', "Disabling Web Worker due to persistent errors. Falling back to Main Thread ACE.");
        this.isDisabled = true;
    }

    this.pendingRejects.forEach((reject) => reject(new Error(`workerErrors.eventError: ${errorMsg}`)));
    this.pendingResolves.clear();
    this.pendingRejects.clear();
  }

  public async postMessage(message: any, transfer: Transferable[] = []): Promise<{ data: TechnicalsData; buffers?: KlineBuffers }> {
    const w = this.getWorker();
    if (!w) throw new Error("workerErrors.notAvailable");
    
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pendingResolves.set(id, resolve);
      this.pendingRejects.set(id, reject);
      w.postMessage({ ...message, id }, transfer);
      
      setTimeout(() => {
        if (this.pendingResolves.has(id)) {
          this.pendingRejects.get(id)?.(new Error("workerErrors.timeout"));
          this.pendingResolves.delete(id);
          this.pendingRejects.delete(id);
        }
      }, 5000);
    });
  }
  
  isHealthy(): boolean {
      return !this.isDisabled && (this.worker !== null || !browser);
  }
}

const workerManager = new TechnicalsWorkerManager();

const settingsCache = new WeakMap<object, string>();
const indicatorsCache = new WeakMap<object, string>();

// Optimization: Extremely fast serializer that skips function generation overhead and quotes
function fastSerialize(obj: any): string {
  if (!obj) return "";
  let res = "";
  for (const k in obj) {
      if (k === '_cachedJson') continue;
      const v = obj[k];
      if (typeof v === 'object' && v !== null) {
          res += k + "{";
          for (const subK in v) {
              res += subK + ":" + v[subK] + ",";
          }
          res += "}";
      } else {
          res += k + ":" + v + ",";
      }
  }
  return res;
}

function generateCacheKey(lastTime: number, lastPriceStr: string, len: number, firstTime: number, settings: any, enabledIndicators?: any): string {
  let sPart = settings?._cachedJson;
  if (!sPart) {
    sPart = (settings && typeof settings === 'object') ? settingsCache.get(settings) : null;
    if (!sPart) {
      sPart = fastSerialize(settings);
      if (settings && typeof settings === 'object') settingsCache.set(settings, sPart);
    }
  }

  let iPart = (enabledIndicators && typeof enabledIndicators === 'object') ? indicatorsCache.get(enabledIndicators) : null;
  if (!iPart) {
    iPart = fastSerialize(enabledIndicators);
    if (enabledIndicators && typeof enabledIndicators === 'object') indicatorsCache.set(enabledIndicators, iPart);
  }

  return `${lastTime}_${lastPriceStr}_${len}_${firstTime}_${sPart}_${iPart}`;
}

// Feature Check (Outcome of Step 7)
let capabilityCheckDone = false;
async function notifyCapabilityStatus() {
    if (!browser || capabilityCheckDone) return;
    capabilityCheckDone = true;
    
    // Check if warning has already been shown on this device
    const storageKey = 'cachy_performance_warning_shown';
    if (localStorage.getItem(storageKey)) return;
    
    // Ensure we have latest capabilities
    const caps = await getCapabilities();
    
    const missing: string[] = [];
    if (!caps.sharedMemory) missing.push("SharedMemory (COOP/COEP)");
    if (!caps.gpu) missing.push("WebGPU");
    
    if (missing.length > 0) {
        // Warning, not error - app still works via fallbacks
        const msg = `Performance Warning: Missing ${missing.join(", ")}. Using fallback engine.`;
        logger.warn('technicals', msg);
        toastService.warning(msg, 8000);
        
        // Mark as shown
        localStorage.setItem(storageKey, 'true');
    } else {
        logger.log('technicals', "All high-performance features available.");
    }
}

export const technicalsService = {
  async calculateTechnicals(klinesInput: any[], settings?: IndicatorSettings, enabledIndicators?: any): Promise<TechnicalsData> {
    const finalSettings = settings || indicatorState.toJSON();
    let klines = klinesInput;
    const limit = Math.max(finalSettings.historyLimit || 750, 1);
    if (klines.length > limit) klines = klines.slice(-limit);
    if (klines.length === 0) return getEmptyData();
    
    cleanupStaleCache();
    const lastKline = klines[klines.length - 1];
    const cacheKey = generateCacheKey(lastKline.time, lastKline.close?.toString() || "0", klines.length, klines[0].time, finalSettings, enabledIndicators);

    const cached = calculationCache.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      return cached.data;
    }

    const engine = calculationStrategy.selectEngine(klines.length, finalSettings);
    
    try {
      let finalResult: TechnicalsData | undefined;
      let actualEngine = engine;
      const startMs = performance.now();
      
      if (engine === 'wasm') {
        const { wasmCalculator } = await import("./wasmCalculator");
        if (wasmCalculator.isAvailable()) {
            finalResult = await wasmCalculator.calculate(klines, finalSettings, enabledIndicators || {});
        }
      } else if (engine === 'gpu') {
        const { webGpuCalculator, WebGpuCalculator } = await import("./webGpuCalculator");
        if (await WebGpuCalculator.isSupported()) {
            finalResult = await webGpuCalculator.calculate(klines, finalSettings, enabledIndicators || {});
        }
      }

      if (!finalResult) {
          if (workerManager.isHealthy()) {
            actualEngine = 'auto'; // Will use TS worker
            finalResult = await this.calculateWithWorker(klines, finalSettings, enabledIndicators);
          } else {
            actualEngine = 'ts'; // Inline
            finalResult = this.calculateTechnicalsInline(klines, finalSettings, enabledIndicators);
          }
      }
      
      const duration = performance.now() - startMs;
      calculationStrategy.recordMetrics(actualEngine === 'auto' ? 'ts' : actualEngine, duration, true, klines.length);

      // Cache storage

      // Cache storage
      if (calculationCache.size >= MAX_CACHE_SIZE) {
          let oldestKey = ''; let oldestTime = Infinity;
          calculationCache.forEach((entry, key) => { if (entry.lastAccessed < oldestTime) { oldestTime = entry.lastAccessed; oldestKey = key; } });
          if (oldestKey) calculationCache.delete(oldestKey);
      }
      
      calculationCache.set(cacheKey, { data: finalResult, timestamp: Date.now(), lastAccessed: Date.now() });
      return finalResult;
    } catch (e) {
      logger.warn('technicals', "Engine fallback triggered", e);
      // Engine failed, record failure
      calculationStrategy.recordMetrics(engine === 'auto' ? 'ts' : engine, 0, false, klines.length);
      
      const startFallback = performance.now();
      const fallbackResult = this.calculateTechnicalsInline(klines, finalSettings, enabledIndicators);
      const fallbackDuration = performance.now() - startFallback;
      calculationStrategy.recordMetrics('ts', fallbackDuration, true, klines.length);
      
      return fallbackResult;
    }
  },

  async calculateWithWorker(klines: any[], settings: IndicatorSettings, enabledIndicators?: any): Promise<TechnicalsData> {
    const len = klines.length;
    const times = new Float64Array(len);
    const opens = new Float64Array(len);
    const highs = new Float64Array(len);
    const lows = new Float64Array(len);
    const closes = new Float64Array(len);
    const volumes = new Float64Array(len);

    for (let i = 0; i < len; i++) {
      const k = klines[i];
      times[i] = k.time;
      opens[i] = toNumFast(k.open);
      highs[i] = toNumFast(k.high);
      lows[i] = toNumFast(k.low);
      closes[i] = toNumFast(k.close);
      volumes[i] = toNumFast(k.volume);
    }

    const { data: result } = await workerManager.postMessage({
      type: "CALCULATE",
      payload: { times, opens, highs, lows, closes, volumes, settings, enabledIndicators }
    }, [times.buffer, opens.buffer, highs.buffer, lows.buffer, closes.buffer, volumes.buffer]);

    return result;
  },

  async initializeTechnicals(symbol: string, timeframe: string, klines: any[], settings?: IndicatorSettings, enabledIndicators?: any): Promise<TechnicalsData> {
    notifyCapabilityStatus();
    if (!workerManager.isHealthy()) {
        return this.calculateTechnicalsInline(klines, settings, enabledIndicators);
    }

    try {
        const { data: result } = await workerManager.postMessage({
            type: "INITIALIZE",
            payload: {
                symbol, timeframe,
                klines: klines.map(k => ({ ...k, open: k.open.toString(), high: k.high.toString(), low: k.low.toString(), close: k.close.toString(), volume: k.volume?.toString() || "0" })),
                settings, enabledIndicators
            }
        });
        return result;
    } catch (e) {
        return this.calculateTechnicalsInline(klines, settings, enabledIndicators);
    }
  },

  async updateTechnicals(symbol: string, timeframe: string, kline: any): Promise<TechnicalsData> {
    if (!workerManager.isHealthy()) {
        // Cannot update incrementally without worker. Throw to force re-init/fallback in manager.
        throw new Error("Worker unavailable for update"); 
    }

    try {
        const { data: result } = await workerManager.postMessage({
            type: "UPDATE",
            payload: {
                symbol, timeframe,
                kline: { ...kline, open: kline.open.toString(), high: kline.high.toString(), low: kline.low.toString(), close: kline.close.toString(), volume: kline.volume?.toString() || "0" }
            }
        });
        return result;
    } catch (e) {
        throw e; // Propagate error to manager to trigger re-init
    }
  },

  async shiftTechnicals(symbol: string, timeframe: string, kline: any): Promise<void> {
      if (!workerManager.isHealthy()) {
          throw new Error("Worker unavailable for shift");
      }
      try {
          await workerManager.postMessage({
              type: "SHIFT",
              payload: {
                  symbol, timeframe,
                  kline: { ...kline, open: kline.open.toString(), high: kline.high.toString(), low: kline.low.toString(), close: kline.close.toString(), volume: kline.volume?.toString() || "0" }
              }
          });
      } catch (e) {
          throw e;
      }
  },

  // Cleanup: Remove worker state to prevent leaks
  async cleanupTechnicals(symbol: string, timeframe: string) {
      if (!workerManager.isHealthy()) return;
      try {
          await workerManager.postMessage({
              type: "CLEANUP",
              payload: { symbol, timeframe }
          });
          logger.debug('technicals', `Cleaned up worker state for ${symbol}:${timeframe}`);
      } catch (e) {
          logger.warn('technicals', `Failed to cleanup worker state for ${symbol}:${timeframe}`, e);
      }
  },

  calculateTechnicalsInline(klines: any[], settings?: IndicatorSettings, enabledIndicators?: any): TechnicalsData {
    const finalSettings = settings || indicatorState.toJSON();
    const klinesDec = klines.map((k) => ({
      time: k.time, open: new Decimal(k.open), high: new Decimal(k.high), low: new Decimal(k.low), close: new Decimal(k.close), volume: new Decimal(k.volume || 0),
    }));
    return calculateAllIndicators(klinesDec, finalSettings, enabledIndicators);
  },
};
