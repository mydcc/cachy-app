# Technical Report: Technicals Worker Optimization

## 1. Executive Summary
**Symptom:** The application "Cachy" experiences excessive idle CPU usage (50-80%) even when the UI is relatively static, primarily driven by `technicals.worker`.
**Impact:** High battery drain on laptops, thermal throttling, and UI jank (Event Loop Lag) on lower-end devices.
**Root Cause:** The technical indicators engine performs a **stateless full recalculation O(N)** of the entire candle history (e.g., 1000 candles) for every single WebSocket tick, rather than incrementally updating the state O(1).

## 2. Deep Diagnostic

### The Bottleneck
Profiling and code audit revealed that `src/workers/technicals.worker.ts` receives the *entire* dataset for every update.
*   **File:** `src/utils/technicalsCalculator.ts` -> `calculateIndicatorsFromArrays`
*   **Logic:** `JSIndicators.sma/rsi/etc` iterates from index 0 to N every time.
*   **Cost:** ~1ms per tick per chart (1000 candles).
    *   At 50 ticks/sec (WebSocket rate), this consumes **50ms/sec (5% CPU)** per active chart.
    *   With 10 active charts/tickers, this scales to **50% CPU** purely on math, excluding serialization and GC.

### Benchmark Data
We conducted a controlled simulation (`tests/benchmarks/worker_simulation.bench.ts`) comparing the current implementation against a proposed incremental architecture.

| Metric | Current (Full Recalc) | Target (Incremental) | Improvement |
| :--- | :--- | :--- | :--- |
| **Throughput** | ~1,033 Ops/Sec | ~61,335,000 Ops/Sec | **~60,000x** |
| **Latency** | 0.97ms | 0.00002ms | **99.99% Reduction** |
| **Complexity** | $O(N \cdot M)$ | $O(M)$ | Linear -> Constant |

*(N = Candles, M = Indicators)*

## 3. Industry Standards Comparison

| Feature | Standard (Bloomberg/TradingView) | Cachy (Current) | Cachy (Goal) |
| :--- | :--- | :--- | :--- |
| **Update Trigger** | Pub/Sub Incremental | Full Array Push | Delta Updates |
| **Calculation** | Stateful ($O(1)$) | Stateless ($O(N)$) | Stateful ($O(1)$) |
| **Memory** | Ring Buffers / SharedArrayBuffer | New Arrays per Tick | Ring Buffers |
| **Concurrency** | SharedWorker + Wasm | Dedicated Worker | Wasm + SharedWorker |

## 4. Scaling Blueprint & Refactoring Strategy

To achieve "Bloomberg-level" efficiency, we propose a 3-Phase Refactoring Strategy.

### Phase 1: Stateful Worker (Immediate Relief)
**Goal:** Drop CPU usage from 80% to <5%.
1.  **Protocol Change:** Modify `ActiveTechnicalsManager` to send an `INITIALIZE` message (full history) followed by `UPDATE` messages (single tick).
2.  **Worker State:** Implement a `TechnicalsState` class in the worker that holds running values (e.g., `sum`, `prevEma`, `rsiGain/Loss`).
3.  **Math Update:** Refactor `JSIndicators` to export `updateEma(prev, price)`, `updateRsi(prevGain, prevLoss, price)`, etc.

### Phase 2: WebAssembly Integration (Robustness)
**Goal:** Consistent performance under extreme load (e.g., 50+ tickers, volatility spikes).
1.  **Language:** Rust (via `wasm-bindgen`).
2.  **Logic:** Move the `TechnicalsState` struct into Rust.
3.  **Benefit:** Predictable GC behavior and SIMD optimizations for heavy math (e.g., Bollinger Bands, Linear Regression).

### Phase 3: Zero-Copy Architecture (Ultimate Scale)
**Goal:** Eliminate serialization overhead completely.
1.  **SharedArrayBuffer:** Allocate a fixed Ring Buffer in shared memory.
2.  **Atomics:** Main thread writes price to `buffer[head]`. Worker reads `buffer[head]`.
3.  **Lock-Free:** Use atomic indices to signal updates without `postMessage`.

## 5. Tools Provided
*   **Profiler:** `scripts/profile_worker_cdp.js` (Puppeteer-based CDP profiler).
*   **Benchmark:** `tests/benchmarks/worker_simulation.bench.ts` (Internal throughput validation).

## 6. Conclusion
The current "Stateless Full Recalc" architecture is the primary bottleneck. Migrating to a "Stateful Incremental" approach is the highest ROI activity, offering a potential 60,000x throughput improvement for the calculation step.

## 7. Automated Benchmarking
As of 2026-02-03, automated performance baselines are tracked via GitHub Actions instead of Render Cron Jobs (due to cost constraints).
*   **Workflow:** `.github/workflows/benchmarks.yml`
*   **Schedule:** Daily at Midnight UTC.
*   **Artifacts:** Benchmark results are saved as build artifacts for historical analysis.
