# Calculation Engine – Developer Guide

## Architecture

```
technicalsService.ts          ← entry point (routing + caching)
  ├── calculationStrategy.ts  ← engine selection + adaptive learning
  ├── technicalsCalculator.ts ← TypeScript engine (pure math)
  ├── wasmCalculator.ts       ← WASM bridge
  └── webGpuCalculator.ts     ← GPU engine (WGSL shaders)
```

## Adding a New Indicator

### 1. TypeScript Engine

Edit `src/utils/technicalsCalculator.ts` → `calculateIndicatorsFromArrays()`:

```typescript
// Add after existing indicator blocks
if (shouldCalculate('myIndicator')) {
  const values = JSIndicators.myIndicator(closes, settings.myIndicator.period);
  // Push to result.oscillators or result.movingAverages
}
```

### 2. WASM Engine

1. Add Rust function in `cachy-wasm/src/lib.rs`
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
| `selectEngine(candleCount, settings)` | Choose optimal engine |
| `recordPerformance(metrics)` | Log execution time (feeds adaptive learning) |
| `recordFailure(engine, error)` | Track failures (circuit breaker) |
| `isEngineHealthy(engine)` | Check circuit breaker state |
| `exportTelemetry()` | Full debug snapshot |

### `technicalsService.ts`

| Method | Purpose |
|--------|---------|
| `calculateTechnicals(klines, settings)` | Main entry: routes to engine, caches, records perf |
| `calculateTechnicalsInline(klines, settings)` | Sync TS calculation (no worker) |

### Circuit Breaker

- **Threshold**: 3 consecutive failures → engine disabled
- **Cooldown**: 5 minutes → half-open (retries once)
- **Recovery**: Successful calculation resets failure count
- **Retry**: On first failure, retries once before falling back to TS

### Performance History

- Stored in `localStorage` key `cachy_engine_perf_history`
- Max 100 entries, 7-day TTL
- Persisted every 10 entries (throttled writes)

## Testing

```bash
# Unit tests (edge cases)
npx vitest run src/tests/unit/edge_cases.test.ts

# Performance benchmarks
npx vitest run src/tests/performance/engine_benchmark.test.ts

# Memory profiling
npx vitest run src/tests/performance/memory_profiling.test.ts

# Load testing (1k-50k candles)
npx vitest run src/tests/performance/load_testing.test.ts

# All calculation tests
npx vitest run src/tests/unit/edge_cases.test.ts src/tests/performance/

# Type checking
npx tsc --noEmit
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
| `src/services/incrementalCache.ts` | Incremental calculation cache |
| `src/utils/technicalsCalculator.ts` | Pure TypeScript indicator calculations |
| `src/utils/indicators.ts` | Low-level math functions (SMA, EMA, RSI, etc.) |
| `src/shaders/*.wgsl` | GPU compute shaders |
| `src/components/settings/EngineDebugPanel.svelte` | Debug dashboard UI |
