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
| `src/components/shared/OrderHistoryList.svelte` | endTime, em, startTime, ed, ey, ... |
| `src/lib/calculators/charts.ts` | sortedByDate, topSymbols, bottomSymbols, journal, longCurve, ... |
| `src/lib/calculators/stats.ts` | closedTrades, journal, tradesToIterate, reorder, hourlyNetPnl, ... |
| `src/lib/chart/indicatorLayer.test.ts` | lineOpts, bandValues, calls, alertLine, subPaneIndices, ... |
| `src/lib/rules/indicatorSeries.test.ts` | rows, bars |
| `src/lib/windows/implementations/CandleChartView.component.test.ts` | appliedChartOptions |
| `src/services/wasmIndicatorWindows.test.ts` | history, wrong, check, walkWasm, i, ... |
| `src/utils/appReset.test.ts` | databaseNames |
| `src/utils/circularBuffer.ts` | U, map, callback, i, result |
| `src/utils/indicators.ts` | spanBPeriod, c, close, v, idx, ... |
| `static/wasm/technicals_wasm.d.ts` | TechnicalsCalculator |
| `tests/benchmarks/wasm_parity.bench.ts` | roundTrip, last, series, calc, history |
| `tests/gpu/parityCases.ts` | up, up, v, v |
| `tests/integration/wasm_parity.test.ts` | runWasm, calc |

## Connected Communities

- **services +14 dirs** (19 cross-edges)
- **utils +3 dirs · fill** (17 cross-edges)
- **utils +2 dirs** (5 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (4 cross-edges)
- **services +10 dirs · slice** (4 cross-edges)
- **services +30 dirs** (4 cross-edges)
- **services +5 dirs · encrypt** (1 cross-edges)
- **stores +1 dirs · find** (1 cross-edges)
- **calculators +12 dirs** (1 cross-edges)
- **rules +3 dirs** (1 cross-edges)
- **utils · calculateAwesomeOscillator** (1 cross-edges)
- **utils · calculateADXSeries** (1 cross-edges)
- **utils +3 dirs · release** (1 cross-edges)
- **chart +3 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-746")
explore(operation:"context", task:"understand utils +10 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
