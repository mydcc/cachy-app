# Adaptive Calculation Engine

## Overview

Cachy uses a **static multi-engine architecture** to calculate technical indicators. It selects the fastest available engine based on fixed dataset size thresholds and hardware detection.

## Engines

| Engine | Best For | Requirements |
|--------|----------|-------------|
| **TypeScript** | Small datasets, universal fallback | Always available |
| **WebAssembly** | >300 candles (degrades to TS if last WASM run > 500ms) | WebAssembly global present (note: the availability flag is optimistic — true before the module finishes loading) |
| **WebGPU** | Large datasets (>5000 candles) | A browser with WebGPU (`navigator.gpu` + adapter; e.g. recent Chrome/Edge with hardware GPU). No version pin is enforced in code. |

> The GPU branch only triggers when History Scope exceeds 5000 (default 750 keeps all calculations on TS/WASM).

## How Engine Selection Works

1. **Device Detection**: At startup (lazily, via a cached singleton prefetched by the strategy), Cachy detects which engines the browser supports (WASM, SIMD, WebGPU).
2. **Static Thresholds**: The engine is selected based on the number of candles (>5000 → GPU, >300 → WASM, else TS).
3. **Preferred Engine Override**: Users can force a specific engine (TS, WASM, WebGPU) via settings (Technicals settings → Preferred Engine: Auto/TS/WASM/GPU).
4. **Basic Degradation**: If the last WASM run exceeds 500ms (tracked as `lastMedian`, currently the latest single sample rather than a true median), the system falls back to TypeScript.

## Calculation Settings

Two independent concepts — do not conflate them:

- **Analysis presets** (Settings → System → Performance → Calculation Settings): **Light** / **Balanced** (default) / **Pro**. They control market-analysis refresh interval, cache size and news analysis — not the math engine.
- **Engine controls** (Technicals settings): **Preferred Engine** (Auto/TS/WASM/GPU) and **Performance Mode** (Speed/Balanced/Quality; default Balanced; currently only switches buffer-pool reuse).

## Current Engine Behavior

- **Context Awareness**: Battery level, available memory, and device type (`src/services/capabilityDetection.ts`) are detected and shown in the debug panel, but do not currently influence engine selection (`selectEngine` reads only the preferred-engine override and the WASM timing rule).

## Planned Features (Backlog)

The following advanced features are planned but not yet fully implemented:
- **Adaptive Learning** (partial): Benchmark infrastructure exists (`src/services/engineBenchmark.ts`) and benchmarks feed `recordMetrics`, but `selectEngine` still uses only static thresholds + the WASM timing rule.
- **Circuit Breaker** (derived, not enforced): `exportTelemetry()` reports healthy/degraded per engine from the >500ms rule, but there is no failure counter, no timed disable, and no half-open retry — selection only applies the timing rule on the next call.
- **Dynamic Quality Modes**: No precision-driven engine switching exists; Performance Mode (Speed/Balanced/Quality) currently only toggles buffer-pool reuse.

## Debug Panel

Enable **Debug Mode** (Settings → System → Performance sub-tab) to see:
- Which engines are available on the device
- Per-engine average time, sample count, health and usage share (p95 is computed by `runBenchmark()` but not shown in the panel)
- Recent calculation history (last 10 of max 50 in-memory entries)

## Performance

Illustrative figures, not asserted by tests (`engine_benchmark.test.ts` only budgets the TypeScript path: 100 candles < 100ms, 1000 < 200ms, 5000 < 750ms, 10000 < 1500ms):

| Dataset | TypeScript | GPU |
|---------|-----------|-----|
| 1,000 candles | ~15ms | ~20ms (dispatch overhead) |
| 5,000 candles | ~37ms | ~15ms |
| 10,000 candles | ~86ms | ~25ms |
| 50,000 candles | ~301ms | ~50ms |

GPU benefits increase with dataset size due to parallel processing.

> Illustrative figures on modern hardware. Run `npx vitest run src/tests/performance/engine_benchmark.test.ts` to reproduce the TypeScript column only; there is no automated GPU benchmark.
