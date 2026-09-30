# Calculation Engine – Developer Guide

## Numeric boundary

Every engine here is **analysis-grade and operates in f64** — `Float64Array`
scratch buffers, and `Decimal.toNumber()` at the input edge in
`technicalsCalculator.ts`. That is deliberate and matches
[ADR-0021](adr/0021-decimal-money-boundary-display-stays-f64.md). Indicator values
produced here must never be fed back into calculator, risk, journal or order
logic, which is `decimal.js` territory — `statefulTechnicalsCalculator.ts` is the
documented display-only f64 boundary.

## Architecture

```
technicalsService.ts          ← entry point (routing + caching)
  ├── calculationStrategy.ts  ← engine selection
  ├── utils/technicalsCalculator.ts ← TypeScript engine (pure math; also runs inside src/workers/technicals.worker.ts)
  ├── wasmCalculator.ts       ← WASM bridge
  └── webGpuCalculator.ts     ← GPU engine (WGSL shaders)
```

Live updates flow through `activeTechnicals/calculationExecutor.ts`, which enforces its own `historyLimit`.

## Adding a New Indicator

### 1. TypeScript Engine

Edit `src/utils/technicalsCalculator.ts` → `calculateIndicatorsFromArrays()`:

```typescript
// Add after existing indicator blocks
if (shouldCalculate('myIndicator')) {
  const values = JSIndicators.myIndicator(closes, settings.myIndicator.period);
  // Push to the `oscillators` / `movingAverages` locals, which are assembled
  // into the returned `TechnicalsData` at the end of the function
}
```

### 2. WASM Engine

1. Add Rust function in `technicals-wasm/src/lib.rs`
2. Expose via `#[wasm_bindgen]`
3. Call from `src/services/wasmCalculator.ts`

### 3. GPU Engine (WGSL Shader)

1. Create shader in `src/shaders/my_indicator.wgsl`:

```wgsl
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;

struct Params {
  window_size: u32,
  data_len: u32,
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.data_len) { return; }
  // ... calculation logic ...
  output[i] = result;
}
```

2. Import and use in `src/services/webGpuCalculator.ts`:

```typescript
import myShader from '../shaders/my_indicator.wgsl?raw';

// In calculate():
const myResult = await this.compute('myIndicator', myShader, [inputData], [period, len], len);
```

## Key Services

### `calculationStrategy.ts`

| Method | Purpose |
|--------|---------|
| `selectEngine(settings)` | Pin one engine for the session (WASM when available, TS otherwise); honors an explicit `preferredEngine` and the 5-minute re-probe window after degradation. It never receives a candle count. |
| `exportTelemetry()` | Full debug snapshot |

### `technicalsService.ts`

| Method | Purpose |
|--------|---------|
| `calculateTechnicals(klinesInput, settings?)` | Main entry: enforces `historyLimit` (default 750), routes to the selected engine, caches, records perf |
| `calculateTechnicalsInline(klines, settings)` | Sync TS calculation (no worker) |

### Circuit Breaker (derived, not enforced)

- **Status**: Health is derived from the timing rule via `exportTelemetry()`; selection reapplies the timing rule on the next call. Consequence: **3 consecutive** live runs of the pinned engine above 500ms degrade `selectEngine` to `ts` for the rest of a 5-minute degradation window. Only `context === 'live'` counts, so benchmark runs never degrade anything. When the window elapses the pinned engine is re-probed automatically, and a successful run resets `slowRuns`.
- Do not confuse this with the worker crash guard (`technicalsService.ts` disables the worker after >2 consecutive failures) — that protects the worker, not the engine selection.
- **Planned behavior**: 3 consecutive failures → engine disabled for 5 minutes → half-open (retries once) → successful calculation resets failure count. Of these, only the 5-minute window exists today. The engine-level breaker is timing-derived and has no failure count and no half-open state; the only real failure counter is the worker crash guard, and its disable is permanent.

### Performance History

- Held in memory only (max 50 entries, no TTL, no `localStorage` persistence; the debug panel shows the last 10).

## Testing

```bash
# Unit tests (edge cases)
npx vitest run src/tests/unit/edge_cases.test.ts

# Performance benchmarks (TypeScript path only)
npx vitest run src/tests/performance/engine_benchmark.test.ts

# Memory profiling
npx vitest run src/tests/performance/memory_profiling.test.ts

# Load testing (1k-50k candles)
npx vitest run src/tests/performance/load_testing.test.ts

# All calculation tests
npx vitest run src/tests/unit/edge_cases.test.ts src/tests/performance/

# Type checking
npm run check
```

## File Map

| File | Purpose |
|------|---------|
| `src/services/calculationStrategy.ts` | Engine selection, adaptive learning, circuit breaker |
| `src/services/technicalsService.ts` | Main service: routing, caching, perf recording |
| `src/services/webGpuCalculator.ts` | WebGPU engine with buffer cache |
| `src/services/wasmCalculator.ts` | WASM bridge |
| `src/services/engineBenchmark.ts` | In-app benchmark (call from console) |
| `src/services/capabilityDetection.ts` | Device/browser capability detection |
| `src/services/incrementalCache.ts` | Incremental calculation cache (standalone, under test — the live path uses technicalsService's inline result cache, not this class) |
| `src/utils/technicalsCalculator.ts` | Pure TypeScript indicator calculations |
| `src/utils/indicators.ts` | Low-level math functions (SMA, EMA, RSI, etc.) |
| `src/shaders/*.wgsl` | GPU compute shaders |
| `src/components/settings/EngineDebugPanel.svelte` | Debug dashboard UI |
