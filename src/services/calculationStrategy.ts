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
 * Adaptive Calculation Strategy (ACE)
 * Implementation of Production Hardening Roadmap (Step 4 & 5)
 */

import type { IndicatorSettings } from '../types/indicators';
import { toastService } from './toastService.svelte';
import { getCapabilities, type BrowserCapabilities } from './capabilityDetection';
import { _ } from '../locales/i18n';
import { get } from 'svelte/store';

export type CalculationEngine = 'ts' | 'wasm' | 'gpu' | 'auto';

// Shape EngineDebugPanel.svelte reads per engine — populated by
// exportTelemetry() below from the degradation rule in selectEngine().
export interface EngineCircuitBreakerHealth {
  healthy: boolean;
  lastError: string;
  failures: number;
}

interface EngineMetrics {
    calls: number;
    totalTime: number;
    errors: number;
    lastMedian: number;
}

export class CalculationStrategy {
  private lastLagToastAt = 0;

  constructor() {
    this.warmCapabilities();
  }

  private metrics: Record<CalculationEngine, EngineMetrics> = {
    ts: { calls: 0, totalTime: 0, errors: 0, lastMedian: 0 },
    wasm: { calls: 0, totalTime: 0, errors: 0, lastMedian: 0 },
    gpu: { calls: 0, totalTime: 0, errors: 0, lastMedian: 0 },
    auto: { calls: 0, totalTime: 0, errors: 0, lastMedian: 0 }
  };

  /**
   * Selects the best engine based on load and capabilities.
   * Roadmap Step 5: Automatic degradation if performance is poor.
   */
  selectEngine(klineCount: number, settings: IndicatorSettings): CalculationEngine {
    if (settings.preferredEngine && settings.preferredEngine !== 'auto') {
      return settings.preferredEngine;
    }

    // Performance Alerting & Degradation (Step 5)
    // A single WASM run above 500ms (lastMedian holds the latest sample, not
    // a true median) degrades selectEngine to 'ts' for the rest of the
    // session: the degraded engine is never re-selected, so no new WASM
    // sample can clear the flag. No automatic recovery (re-probing); only a
    // page reload or the preferredEngine override resets this.
    if (this.metrics.wasm.lastMedian > 500) {
        console.warn("[ACE] WASM too slow, degrading to TS Worker");
        return 'ts';
    }

    // Auto Selection
    if (klineCount > 5000) return 'gpu';
    // WASM is already faster than TS at 500 candles (IDEA-0318 F-7 benchmark),
    // so route it down to the realistic historyLimit range (~300-750 candles).
    if (klineCount > 300) return 'wasm';
    return 'ts';
  }

  private performanceHistory: {
      engine: CalculationEngine;
      candleCount: number;
      executionTime: number;
      memoryUsed: number;
      timestamp: number;
  }[] = [];

  recordMetrics(engine: CalculationEngine, duration: number, success: boolean, candleCount: number = 0) {
    const m = this.metrics[engine];
    m.calls++;
    m.totalTime += duration;
    m.lastMedian = duration; // latest single duration standing in for a median — one spike degrades wasm until another wasm run (no auto recovery)
    if (!success) m.errors++;
    
    // Add to history
    this.performanceHistory.push({
        engine,
        candleCount,
        executionTime: duration,
        memoryUsed: 0,
        timestamp: Date.now()
    });
    
    // Keep history manageable
    if (this.performanceHistory.length > 50) {
        this.performanceHistory.shift();
    }

    // Threshold warning (Step 5). Toasts are throttled so a slow live path
    // can't stack one toast per recalculation on a weak device.
    if (duration > 500) {
        console.error(`[ACE] CRITICAL: Engine ${engine} took ${duration.toFixed(2)}ms`);
        if (Date.now() - this.lastLagToastAt > 30_000) {
            this.lastLagToastAt = Date.now();
            toastService.error(get(_)("calculationStrategy.criticalLag", { values: { engine: engine.toUpperCase(), duration: duration.toFixed(0) } }));
        }
    } else if (duration > 100) {
        console.warn(`[ACE] Warning: Engine ${engine} took ${duration.toFixed(2)}ms`);
        if (Date.now() - this.lastLagToastAt > 30_000) {
            this.lastLagToastAt = Date.now();
            toastService.warning(get(_)("calculationStrategy.slowCalc", { values: { engine: engine.toUpperCase(), duration: duration.toFixed(0) } }), 2000);
        }
    }
  }

  private capabilitiesSnapshot: BrowserCapabilities | null = null;
  private capabilitiesRequested = false;
  private capabilitiesPromise: Promise<void> | null = null;

  /** Fire-and-forget capability prefetch so exportTelemetry() stays sync. */
  warmCapabilities(): Promise<void> {
    if (this.capabilitiesRequested) return this.capabilitiesPromise ?? Promise.resolve();
    this.capabilitiesRequested = true;
    this.capabilitiesPromise = getCapabilities().then((caps) => { this.capabilitiesSnapshot = caps; }).catch(() => {});
    return this.capabilitiesPromise;
  }

  /** Resolves when the prefetched capability snapshot landed (panel refresh hook). */
  capabilitiesReady(): Promise<void> {
    return this.warmCapabilities();
  }

  /**
   * Result-cache accounting for the technicalsService inline cache.
   * Kept separate from engine metrics on purpose: a cache hit costs ~0ms,
   * so counting it as an engine call would drag every per-engine Avg toward
   * zero and hide real compute cost. The debug panel shows these apart.
   */
  private cacheStats = { hits: 0, misses: 0 };

  recordCacheHit() {
    this.cacheStats.hits++;
  }

  recordCacheMiss() {
    this.cacheStats.misses++;
  }

  exportTelemetry() {
    const caps = this.capabilitiesSnapshot;
    const totalCalls = Object.values(this.metrics).reduce((sum, m) => sum + m.calls, 0);
    const cacheTotal = this.cacheStats.hits + this.cacheStats.misses;
    return {
        stats: this.metrics,
        performanceHistory: this.performanceHistory,
        cache: {
            hits: this.cacheStats.hits,
            misses: this.cacheStats.misses,
            hitRate: cacheTotal > 0 ? Math.round((this.cacheStats.hits / cacheTotal) * 100) : 0
        },
        capabilities: {
            ts: true,
            wasm: caps?.wasm ?? (typeof WebAssembly !== 'undefined'),
            simd: caps?.wasmSIMD ?? false,
            sharedMemory: caps?.sharedMemory ?? false,
            gpu: caps?.gpu ?? false
        },
        context: {
            lowBattery: !!caps && !!caps.battery && !caps.battery.charging && caps.battery.level < 0.2,
            lowMemory: (caps?.deviceMemory ?? 8) < 4,
            isMobile: caps?.isMobile ?? false
        },
        // Derived from the actual degradation rule in selectEngine() (median > 500ms)
        circuitBreaker: {
            wasm: this.metrics.wasm.lastMedian > 500
                ? { healthy: false, lastError: 'median > 500ms — degraded to ts', failures: 1 }
                : { healthy: true, lastError: '', failures: 0 }
        } as Record<string, EngineCircuitBreakerHealth>,
        usagePercent: Object.fromEntries(
            Object.entries(this.metrics).map(([engine, m]) => [
                engine, totalCalls > 0 ? Math.round((m.calls / totalCalls) * 100) : 0
            ])
        ) as Record<string, number>
    };
  }
}

export const calculationStrategy = new CalculationStrategy();