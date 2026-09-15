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
| `src/components/shared/OrderHistoryList.svelte` | em, applyCustomRange, sd, sm, sy, ... |
| `src/lib/calculators/charts.ts` | topSymbols, shortPnl, cumShort, context, getDirectionData, ... |
| `src/lib/calculators/stats.ts` | getTimingData, reorder, hourlyGrossLoss, context, arr, ... |
| `src/lib/chart/indicatorLayer.test.ts` | result, output, subPaneIndices, lineOpts, alertLine, ... |
| `src/lib/rules/indicatorSeries.test.ts` | bars, rows |
| `src/lib/windows/implementations/CandleChartView.component.test.ts` | appliedChartOptions |
| `src/services/wasmIndicatorWindows.test.ts` | history, calc, compared, mismatch, walkWasm, ... |
| `src/utils/appReset.test.ts` | databaseNames |
| `src/utils/circularBuffer.ts` | callback, map, U, result, i |
| `src/utils/indicators.ts` | high, l, res, v, low, ... |
| `static/wasm/technicals_wasm.d.ts` | TechnicalsCalculator |
| `tests/benchmarks/wasm_parity.bench.ts` | history, last, calc, series, roundTrip |
| `tests/gpu/parityCases.ts` | up, up, v, v |
| `tests/integration/wasm_parity.test.ts` | calc, runWasm |

## Connected Communities

- **services +15 dirs** (19 cross-edges)
- **utils +3 dirs · fill** (17 cross-edges)
- **utils +2 dirs** (5 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (4 cross-edges)
- **services +29 dirs** (4 cross-edges)
- **services +10 dirs · slice** (4 cross-edges)
- **services +5 dirs · encrypt** (1 cross-edges)
- **chart +3 dirs** (1 cross-edges)
- **utils · calculateAwesomeOscillator** (1 cross-edges)
- **utils +3 dirs · release** (1 cross-edges)
- **utils · calculateADXSeries** (1 cross-edges)
- **rules +3 dirs** (1 cross-edges)
- **stores +1 dirs · find** (1 cross-edges)
- **backgrounds/engines +11 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-740")
explore(operation:"context", task:"understand utils +10 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
