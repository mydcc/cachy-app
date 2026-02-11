/*
 * Copyright (C) 2026 MYDCT
 *
 * Engine Benchmark Utility
 * Runs in-app performance comparison of GPU vs WASM vs TypeScript engines.
 * Call `runBenchmark()` from browser console or programmatically.
 */

import { technicalsService } from './technicalsService';
import { calculationStrategy } from './calculationStrategy';
import { calculateIndicatorsFromArrays } from '../utils/technicalsCalculator';
import { indicatorState } from '../stores/indicator.svelte';
import type { IndicatorSettings } from '../types/indicators';

export interface BenchmarkRun {
  engine: 'ts' | 'wasm' | 'gpu';
  candleCount: number;
  median: number;
  p95: number;
  runs: number[];
  speedupVsTs: number;
}

export interface BenchmarkResults {
  timestamp: number;
  sizes: number[];
  results: BenchmarkRun[];
  summary: Record<string, Record<number, { median: number; speedup: number }>>;
}

/**
 * Generate synthetic OHLCV klines for benchmarking
 */
function generateTestKlines(count: number): {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}[] {
  const klines = [];
  let price = 100;
  const baseTime = Date.now() - count * 60000;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 0.5;
    const low = Math.min(open, close) - Math.random() * 0.5;
    const volume = 1000 + Math.random() * 9000;

    klines.push({
      time: baseTime + i * 60000,
      open, high, low, close, volume
    });
    price = close;
  }
  return klines;
}

/**
 * Compute median of a sorted numeric array
 */
function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute percentile
 */
function percentile(values: number[], p: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Run benchmark for a single engine at a given data size
 */
async function benchmarkEngine(
  engine: 'ts' | 'wasm' | 'gpu',
  klines: any[],
  settings: IndicatorSettings,
  warmupRuns: number,
  measuredRuns: number
): Promise<number[]> {
  const times: number[] = [];

  for (let i = 0; i < warmupRuns + measuredRuns; i++) {
    const start = performance.now();

    try {
      if (engine === 'ts') {
        // Direct inline calculation (no worker)
        technicalsService.calculateTechnicalsInline(klines, settings);
      } else if (engine === 'wasm') {
        const { wasmCalculator } = await import('./wasmCalculator');
        if (wasmCalculator.isAvailable()) {
             await wasmCalculator.calculate(klines, settings, {});
        } else {
             return [];
        }
      } else if (engine === 'gpu') {
        const { webGpuCalculator, WebGpuCalculator } = await import('./webGpuCalculator');
        if (await WebGpuCalculator.isSupported()) {
             await webGpuCalculator.calculate(klines, settings, {});
        } else {
             return [];
        }
      } else {
        return []; // Engine not available
      }
    } catch {
      return []; // Engine failed
    }

    const elapsed = performance.now() - start;
    if (i >= warmupRuns) {
      times.push(elapsed);
    }
  }
  return times;
}

/**
 * Run a full benchmark across all engines and dataset sizes.
 * 
 * @param sizes - Array of candle counts to test (default: [500, 2000, 5000, 10000])
 * @param warmup - Number of warmup runs per engine (default: 2)
 * @param runs - Number of measured runs per engine (default: 5)
 */
export async function runBenchmark(
  sizes: number[] = [500, 2000, 5000, 10000],
  warmup = 2,
  runs = 5
): Promise<BenchmarkResults> {
  const settings = indicatorState.toJSON();
  const allRuns: BenchmarkRun[] = [];
  const engines: ('ts' | 'wasm' | 'gpu')[] = ['ts'];

  // Check available engines
  try {
      const { wasmCalculator } = await import('./wasmCalculator');
      if (wasmCalculator.isAvailable()) engines.push('wasm');
  } catch(e) {}
  
  try {
      const { WebGpuCalculator } = await import('./webGpuCalculator');
      if (await WebGpuCalculator.isSupported()) engines.push('gpu');
  } catch(e) {}

  console.log(`\n🏁 Starting Benchmark: engines=[${engines.join(', ')}], sizes=[${sizes.join(', ')}], ${warmup} warmup + ${runs} measured runs\n`);

  for (const size of sizes) {
    const klines = generateTestKlines(size);
    let tsMedian = 1; // Fallback for speedup calc

    for (const engine of engines) {
      const times = await benchmarkEngine(engine, klines, settings, warmup, runs);
      if (times.length === 0) {
        console.log(`  ⚠️  ${engine.padEnd(12)} @ ${String(size).padStart(6)} candles: UNAVAILABLE`);
        continue;
      }

      const med = median(times);
      const p95 = percentile(times, 0.95);

      if (engine === 'ts') tsMedian = med;
      const speedup = tsMedian / med;

      const run: BenchmarkRun = {
        engine,
        candleCount: size,
        median: Math.round(med * 100) / 100,
        p95: Math.round(p95 * 100) / 100,
        runs: times.map(t => Math.round(t * 100) / 100),
        speedupVsTs: Math.round(speedup * 100) / 100
      };
      allRuns.push(run);

      // Feed into adaptive strategy
      calculationStrategy.recordMetrics(
        engine,
        med,
        true, // success
        size // candleCount
      );

      console.log(
        `  ${engine === 'ts' ? '📊' : engine === 'wasm' ? '⚙️' : '🎮'} ` +
        `${engine.padEnd(12)} @ ${String(size).padStart(6)} candles: ` + 
        `median=${med.toFixed(1)}ms  p95=${p95.toFixed(1)}ms  ${engine !== 'ts' ? `speedup=${speedup.toFixed(2)}x` : '(baseline)'}`
      );
    }
  }

  // Build summary
  const summary: Record<string, Record<number, { median: number; speedup: number }>> = {};
  for (const run of allRuns) {
    if (!summary[run.engine]) summary[run.engine] = {};
    summary[run.engine][run.candleCount] = { median: run.median, speedup: run.speedupVsTs };
  }

  console.log('\n✅ Benchmark complete. Results fed into adaptive strategy.\n');

  return {
    timestamp: Date.now(),
    sizes,
    results: allRuns,
    summary
  };
}
