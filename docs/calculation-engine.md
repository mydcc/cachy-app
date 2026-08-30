# Adaptive Calculation Engine

## Overview

Cachy uses a **static multi-engine architecture** to calculate technical indicators. It selects the fastest available engine based on fixed dataset size thresholds and hardware detection.

## Engines

| Engine | Best For | Requirements |
|--------|----------|-------------|
| **TypeScript** | Small datasets, universal fallback | Always available |
| **WebAssembly** | Medium datasets (WASM median > 500ms -> fallback TS) | Modern browser |
| **WebGPU** | Large datasets (>5000 candles) | Chrome 113+, hardware GPU |

## How Engine Selection Works

1. **Device Detection**: At startup, Cachy detects which engines the browser supports (WASM, SIMD, WebGPU).
2. **Static Thresholds**: The engine is selected based on the number of candles (e.g., >5000 -> GPU, >1000 -> WASM).
3. **Preferred Engine Override**: Users can force a specific engine (TS, WASM, WebGPU) via settings.
4. **Basic Degradation**: If WASM median execution time exceeds 500ms, the system falls back to TypeScript.

## Calculation Modes

Configure in **Settings > System Performance > Calculation Settings**:
- **Light**: Prioritizes resource efficiency (mobile preset).
- **Balanced** (default): Balances speed and resource usage based on static thresholds.
- **Pro**: Assumes capable hardware, unlocks more parallel work.

## Current Engine Behavior

- **Context Awareness**: Battery level, available memory, and device type are detected at startup (`src/services/capabilityDetection.ts`) and influence engine selection.

## Planned Features (Backlog)

The following advanced features are planned but not yet fully implemented:
- **Adaptive Learning** (partial): Benchmark infrastructure exists (`src/services/engineBenchmark.ts`), but the feedback loop that learns which engine is fastest for the specific hardware is not yet wired to selection.
- **Circuit Breaker** (stub only): Interface defined in `calculationStrategy.ts` (`EngineCircuitBreakerHealth`), but the "3 consecutive failures -> disabled for 5 minutes" logic is not implemented — `circuitBreaker` is currently an empty object.
- **Dynamic Quality Modes**: Engine switching based on precision requirements.

## Debug Panel

Enable **Debug Mode** in Settings > System Performance to see:
- Which engines are available on the device
- Performance stats per engine (avg/p95 execution time)
- Recent calculation history

## Performance

Typical benchmarks on modern hardware:

| Dataset | TypeScript | GPU |
|---------|-----------|-----|
| 1,000 candles | ~15ms | ~20ms (dispatch overhead) |
| 5,000 candles | ~37ms | ~15ms |
| 10,000 candles | ~86ms | ~25ms |
| 50,000 candles | ~301ms | ~50ms |

GPU benefits increase with dataset size due to parallel processing.

> Benchmarks measured on [hardware] @ [date/commit]. Run `npx vitest run src/tests/performance/engine_benchmark.test.ts` to reproduce.
