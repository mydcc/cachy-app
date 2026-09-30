# Adaptive Calculation Engine

## Overview

Cachy uses a **static multi-engine architecture** to calculate technical indicators.
In Auto mode it picks one engine per session and sticks with it. There are no
dataset-size thresholds: routing by candle count was removed on purpose, because
it silently flipped every threshold-edge signal whenever the loaded history
crossed the boundary.

## Engines

| Engine | Best For | Requirements |
|--------|----------|-------------|
| **TypeScript** | Universal fallback, and the degradation target | Always available |
| **WebAssembly** | The default in Auto mode whenever WASM is available | WebAssembly global present (note: the availability flag is optimistic — true before the module finishes loading) |
| **WebGPU** | Explicit opt-in only | A browser with WebGPU (`navigator.gpu` + adapter; e.g. recent Chrome/Edge with hardware GPU). No version pin is enforced in code. |

> The GPU engine is reachable **only** through Preferred Engine = GPU. Auto mode
> never selects it, at any dataset size.

## How Engine Selection Works

1. **Device Detection**: At startup (lazily, via a cached singleton prefetched by the strategy), Cachy detects which engines the browser supports (WASM, SIMD, WebGPU).
2. **Pinning**: Auto mode picks WASM when capability detection reports it, TypeScript otherwise, and then keeps that engine for the session. `selectEngine` never sees a candle count.
3. **Preferred Engine Override**: Users can force a specific engine (TS, WASM, WebGPU) via settings (Technicals settings → Preferred Engine: Auto/TS/WASM/GPU). An explicit choice short-circuits the pinning.
4. **Degradation and recovery**: If **3 consecutive live runs** of the pinned engine exceed 500ms, `selectEngine` serves `ts` instead. The counter resets on any successful run, and only live runs count — benchmark runs are excluded. After a **5-minute degradation window** elapses the pinned engine is re-probed automatically, so recovery needs neither a page reload nor a settings change. The `lastMedian` field is telemetry-only (it holds the latest single sample, not a median) and does not drive the rule. Degradation is derived in [`calculation-engine-dev.md`](calculation-engine-dev.md).

## Calculation Settings

Two independent concepts — do not conflate them:

- **Analysis presets** (Settings → System → Performance → Calculation Settings): **Light** / **Balanced** (default) / **Pro**. They control market-analysis refresh interval, cache size and news analysis — not the math engine.
- **Engine controls** (Technicals settings): **Preferred Engine** (Auto/TS/WASM/GPU) and **History Limit**. There is no Performance Mode control — buffer-pool reuse is unconditional (`BufferPool`, with no settings gate), so there is nothing to switch.

## Current Engine Behavior

- **Context Awareness**: Battery level, available memory, and device type (`src/services/capabilityDetection.ts`) are detected and shown in the debug panel, but do not currently influence engine selection (`selectEngine` reads only the preferred-engine override and the WASM timing rule).

## Planned Features (Backlog)

Planned features:
- **Adaptive Learning** (partial): Benchmark infrastructure exists (`src/services/engineBenchmark.ts`) and benchmarks feed `recordMetrics`, but `selectEngine` still only pins an engine and applies the WASM timing rule.
- **Circuit Breaker** (derived, not enforced): `exportTelemetry()` reports healthy/degraded per engine from the 3-slow-run rule; selection reapplies the timing rule on the next call.
- **Dynamic Quality Modes**: No precision-driven engine switching exists.

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

> Illustrative figures on modern hardware. Run `npx vitest run src/tests/performance/engine_benchmark.test.ts` to reproduce the TypeScript column only; GPU figures are illustrative and unasserted.

## What this engine is not: the rule evaluator

The engines above compute *indicator values* from candle arrays. Deciding
whether a `RuleDocument` fires is a different job, done by the rule
evaluator in `technicals-wasm/src/rule/`: it reads those values and
evaluates each armed rule **once per close of its trigger timeframe** — not
per tick, and without reparsing the rule store per tick (the per-tick legacy
engine was retired in 1.6.0, FEAT-0399). Indicator math answers "what is
RSI(14)"; the evaluator answers "did the rule fire". See
[`alert-system.md`](alert-system.md).
