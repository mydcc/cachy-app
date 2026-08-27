# Adaptive Calculation Engine

## Overview

Cachy uses an **adaptive multi-engine architecture** to calculate technical indicators. It automatically selects the fastest available engine based on your device capabilities, dataset size, and real-time performance data.

## Engines

| Engine | Best For | Requirements |
|--------|----------|-------------|
| **TypeScript** | Small datasets (<1k candles), universal fallback | Always available |
| **WebAssembly** | Medium-large datasets (5k-20k) | Modern browser |
| **WebGPU** | Large datasets (>2k candles), parallelizable work | Chrome 113+, hardware GPU |

## How Engine Selection Works

1. **Device Detection**: On startup, Cachy detects which engines your browser supports (WASM, SIMD, WebGPU)
2. **Context Awareness**: Battery level, available memory, and device type (mobile/desktop) influence selection
3. **Adaptive Learning**: After enough calculations, Cachy learns which engine is fastest for your specific hardware
4. **Circuit Breaker**: If an engine fails 3 times consecutively, it's temporarily disabled for 5 minutes

## Calculation Modes

Configure in **Settings → System → Performance → Calculation Settings**:

- **Speed**: Prioritizes the fastest engine (GPU for large datasets)
- **Balanced** (default): Balances speed and resource usage
- **Quality**: Uses more precise engines, GPU only for very large datasets

## Debug Panel

Enable **Debug Mode** in Settings → System → Performance to see:
- Which engines are available on your device
- Performance stats per engine (avg/p95 execution time)
- Circuit breaker health status
- Recent calculation history

## Performance

Typical benchmarks on modern hardware:

| Dataset | TypeScript | GPU |
|---------|-----------|-----|
| 1,000 candles | ~15ms | ~20ms (dispatch overhead) |
| 5,000 candles | ~37ms | ~15ms |
| 10,000 candles | ~86ms | ~25ms |
| 50,000 candles | ~301ms | ~50ms |

> GPU benefits increase with dataset size due to parallel processing.
