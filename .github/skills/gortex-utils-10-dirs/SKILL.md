---
name: gortex-utils-10-dirs
description: "Work in the utils +10 dirs area — 226 symbols across 14 files (65% cohesion)"
---

# utils +10 dirs

226 symbols | 14 files | 65% cohesion

## When to Use

Use this skill when working on files in:
- `src/components/shared/OrderHistoryList.svelte`
- `src/lib/calculators/charts.ts`
- `src/lib/calculators/stats.ts`
- `src/lib/chart/indicatorLayer.test.ts`
- `src/lib/rules/indicatorSeries.test.ts`
- `src/lib/windows/implementations/CandleChartView.component.test.ts`
- `src/services/wasmIndicatorWindows.test.ts`
- `src/utils/appReset.test.ts`
- `src/utils/circularBuffer.ts`
- `src/utils/indicators.ts`
- `static/wasm/technicals_wasm.d.ts`
- `tests/benchmarks/wasm_parity.bench.ts`
- `tests/gpu/parityCases.ts`
- `tests/integration/wasm_parity.test.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/components/shared/OrderHistoryList.svelte` | startTime, ed, sy, applyCustomRange, ey, ... |
| `src/lib/calculators/charts.ts` | shortCurve, getDirectionData, shortPnl, sortedSymbols, closedTrades, ... |
| `src/lib/calculators/stats.ts` | dayNetPnl, winRateData, journal, reorder, getDurationStats, ... |
| `src/lib/chart/indicatorLayer.test.ts` | result, bandValues, bandSeries, alertLine, chart, ... |
| `src/lib/rules/indicatorSeries.test.ts` | bars, rows |
| `src/lib/windows/implementations/CandleChartView.component.test.ts` | appliedChartOptions |
| `src/services/wasmIndicatorWindows.test.ts` | i, mismatch, c, compared, check, ... |
| `src/utils/appReset.test.ts` | databaseNames |
| `src/utils/circularBuffer.ts` | callback, result, map, i, U |
| `src/utils/indicators.ts` | low, indicators.calculateMFI, period, res, h, ... |
| `static/wasm/technicals_wasm.d.ts` | TechnicalsCalculator |
| `tests/benchmarks/wasm_parity.bench.ts` | roundTrip, history, series, calc, last |
| `tests/gpu/parityCases.ts` | up, v, v, up |
| `tests/integration/wasm_parity.test.ts` | calc, runWasm |

## Connected Communities

- **services +14 dirs** (19 cross-edges)
- **utils +3 dirs · fill** (17 cross-edges)
- **utils +2 dirs** (5 cross-edges)
- **services +10 dirs · slice** (4 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (4 cross-edges)
- **services +30 dirs** (4 cross-edges)
- **calculators +12 dirs** (1 cross-edges)
- **utils · calculateADXSeries** (1 cross-edges)
- **rules +3 dirs** (1 cross-edges)
- **services +6 dirs · encrypt** (1 cross-edges)
- **utils · calculateAwesomeOscillator** (1 cross-edges)
- **stores +1 dirs · find** (1 cross-edges)
- **utils +3 dirs · release** (1 cross-edges)
- **chart +3 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-746")
explore(operation:"context", task:"understand utils +10 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
