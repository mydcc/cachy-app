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

export type CalculationEngine = 'ts' | 'wasm' | 'gpu' | 'auto';

interface EngineMetrics {
    calls: number;
    totalTime: number;
    errors: number;
    lastMedian: number;
}

class CalculationStrategy {
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
    // If WASM is consistently slow (> 500ms), fallback to TS Worker
    if (this.metrics.wasm.lastMedian > 500) {
        console.warn("[ACE] WASM too slow, degrading to TS Worker");
        return 'ts';
    }

    // Auto Selection
    if (klineCount > 5000) return 'gpu';
    if (klineCount > 1000) return 'wasm';
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
    m.lastMedian = duration; // Simple median for now
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

    // Threshold warning (Step 5)
    if (duration > 500) {
        console.error(`[ACE] CRITICAL: Engine ${engine} took ${duration.toFixed(2)}ms`);
        toastService.error(`Critical Lag: ${engine.toUpperCase()} took ${duration.toFixed(0)}ms`);
    } else if (duration > 100) {
        console.warn(`[ACE] Warning: Engine ${engine} took ${duration.toFixed(2)}ms`);
        toastService.warning(`Slow Calc: ${engine.toUpperCase()} (${duration.toFixed(0)}ms)`, 2000);
    }
  }

  exportTelemetry() {
    return { 
        stats: this.metrics,
        performanceHistory: this.performanceHistory,
        // Mock other fields expected by DebugPanel for now
        capabilities: { ts: true, wasm: false, simd: false, sharedMemory: false, gpu: false },
        context: { lowBattery: false, lowMemory: false, isMobile: false },
        circuitBreaker: {} as Record<string, any>,
        usagePercent: {} as Record<string, number>
    };
  }
}

export const calculationStrategy = new CalculationStrategy();