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

export type CalculationEngine = 'ts' | 'wasm' | 'gpu' | 'auto' | 'ts-fallback';

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
    totalCandles: number;
    errors: number;
    lastMedian: number;
}

export class CalculationStrategy {
  private lastLagToastAt = 0;

  // Session pinning + degradation state. Auto mode serves one engine for the
  // whole session so identical market data always yields identical signals.
  private pinnedEngine: 'ts' | 'wasm' | null = null;
  private slowRuns = 0;
  private degraded = false;
  private degradedAt = 0;

  private static readonly SLOW_MS = 500;
  private static readonly SLOW_RUNS_TO_DEGRADE = 3;
  private static readonly REPROBE_MS = 5 * 60 * 1000;

  constructor() {
    this.warmCapabilities();
  }

  private metrics: Record<CalculationEngine, EngineMetrics> = {
    ts: { calls: 0, totalTime: 0, totalCandles: 0, errors: 0, lastMedian: 0 },
    wasm: { calls: 0, totalTime: 0, totalCandles: 0, errors: 0, lastMedian: 0 },
    gpu: { calls: 0, totalTime: 0, totalCandles: 0, errors: 0, lastMedian: 0 },
    auto: { calls: 0, totalTime: 0, totalCandles: 0, errors: 0, lastMedian: 0 },
    'ts-fallback': { calls: 0, totalTime: 0, totalCandles: 0, errors: 0, lastMedian: 0 }
  };

  /**
   * Selects the engine for the next calculation.
   *
   * Auto mode pins one engine per session (same data → same signals, every
   * tick): WASM when available, TS otherwise. Routing by candle count is
   * gone on purpose — it silently flipped every threshold-edge signal
   * whenever the history crossed the threshold. An explicit preferredEngine
   * always wins and bypasses pinning and degradation.
   */
  selectEngine(settings: IndicatorSettings): 'ts' | 'wasm' | 'gpu' {
    if (settings.preferredEngine && settings.preferredEngine !== 'auto') {
      return settings.preferredEngine;
    }

    if (this.degraded) {
      // Recovery probe: after the degradation window the pinned engine gets
      // one more chance. Fast → back to normal; slow → slowRuns rebuilds and
      // it degrades again. Never stuck, never flapping per tick.
      if (Date.now() - this.degradedAt > CalculationStrategy.REPROBE_MS) {
        this.degraded = false;
        this.slowRuns = 0;
        console.info('[ACE] Re-probing pinned engine after degradation window');
      } else {
        return 'ts';
      }
    }

    if (!this.pinnedEngine) {
      // Capabilities resolve async after mount; before the snapshot lands we
      // pin WASM optimistically — the live path falls back to TS per call
      // (counted as ts-fallback) until the snapshot confirms otherwise.
      const caps = this.capabilitiesSnapshot;
      this.pinnedEngine = caps && !caps.wasm ? 'ts' : 'wasm';
    }
    return this.pinnedEngine;
  }

  private performanceHistory: {
      engine: CalculationEngine;
      candleCount: number;
      executionTime: number;
      memoryUsed: number;
      timestamp: number;
  }[] = [];

  recordMetrics(engine: CalculationEngine, duration: number, success: boolean, candleCount: number = 0, context: 'live' | 'bench' = 'live') {
    const m = this.metrics[engine];
    m.calls++;
    m.totalTime += duration;
    m.totalCandles += candleCount;
    m.lastMedian = duration; // latest single duration, kept for telemetry compat — degradation uses slowRuns below, not this
    if (!success) m.errors++;

    // Degradation hysteresis (live path only — benchmark medians must never
    // flip the live engine). Only the pinned engine counts: an explicit
    // preferredEngine choice and ts-fallback runs never degrade auto mode.
    // A fast failure changes nothing: it is neither speed evidence nor
    // slowness evidence.
    if (context === 'live' && engine === this.pinnedEngine) {
      if (duration > CalculationStrategy.SLOW_MS) {
        this.slowRuns++;
        if (this.slowRuns >= CalculationStrategy.SLOW_RUNS_TO_DEGRADE && !this.degraded) {
          this.degraded = true;
          this.degradedAt = Date.now();
          // Claim the throttle slot: the switch notice below already tells
          // the user what happened, so the generic critical-lag toast stays
          // silent on this exact run instead of double-toasting.
          this.lastLagToastAt = Date.now();
          console.error(`[ACE] Engine ${engine} slow ${this.slowRuns}x in a row — auto degraded to TS`);
          toastService.error(get(_)('calculationStrategy.engineDegraded', { values: { engine: engine.toUpperCase() } }));
        }
      } else if (success) {
        this.slowRuns = 0;
      }
    }
    
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
        // Derived from the actual degradation state (3 slow runs → degraded).
        circuitBreaker: {
            wasm: this.degraded
                ? { healthy: false, lastError: 'degraded after 3 slow runs — auto serving ts', failures: this.slowRuns }
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