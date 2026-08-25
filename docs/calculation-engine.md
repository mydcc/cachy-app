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

## Planned Features (Backlog)

The following advanced features are planned but not yet implemented:
- **Context Awareness**: Battery level, available memory, device type (mobile/desktop) influencing selection.
- **Adaptive Learning**: After enough calculations, Cachy learns which engine is actually fastest for the specific hardware.
- **Circuit Breaker**: If an engine fails 3 times consecutively, it is temporarily disabled for 5 minutes.
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
