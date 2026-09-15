---
name: gortex-backgrounds-engines-11-dirs
description: "Work in the backgrounds/engines +11 dirs area — 268 symbols across 17 files (81% cohesion)"
---

# backgrounds/engines +11 dirs

268 symbols | 17 files | 81% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `src/components/shared/backgrounds/engines/GalaxyFlowEngine.ts`
- `src/components/shared/backgrounds/engines/galaxyFlowMapping.test.ts`
- `src/components/shared/backgrounds/engines/smoothing.ts`
- `src/components/shared/backgrounds/engines/volumeScale.ts`
- `src/components/shared/backgrounds/indicatorSignal.ts`
- `src/components/shared/backgrounds/tradeFlow.worker.ts`
- `src/components/shared/windows/WindowFrame.svelte`
- `src/lib/alerts/chartAlertSeed.ts`
- `src/lib/calculators/addToPosition.ts`
- `src/lib/calculators/liquidation.ts`
- `src/lib/windows/fitContentHeight.ts`
- `src/lib/windows/implementations/CandleChartView.svelte`
- `src/stores/riskLimits.svelte.ts`
- `src/utils/chartDisplay.ts`
- `src/utils/server/venues/upstreamRetry.ts`
- `tests/gpu/f32Bound.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | isFinite |
| `src/components/shared/backgrounds/engines/GalaxyFlowEngine.ts` | signal, scaled, activityRotation, activity, priceAxisWorldRadius, ... |
| `src/components/shared/backgrounds/engines/galaxyFlowMapping.test.ts` | p, at |
| `src/components/shared/backgrounds/engines/smoothing.ts` | tau, smoothingAlpha, dt |
| `src/components/shared/backgrounds/engines/volumeScale.ts` | price, normalizePrice, price, lowPercentile, getRange, ... |
| `src/components/shared/backgrounds/indicatorSignal.ts` | rsi, clamped, pickMood, rsiToMood, mood, ... |
| `src/components/shared/backgrounds/tradeFlow.worker.ts` | newSettings, data, onTrade, switchMode, rot, ... |
| `src/components/shared/windows/WindowFrame.svelte` | measure, fitted, apply, guarded |
| `src/lib/alerts/chartAlertSeed.ts` | last, seriesPart, clickedPrice, plainDecimal, conditionFromChartClick, ... |
| `src/lib/calculators/addToPosition.ts` | resultingEntryPrice, ctx, addQuantity, addQuantity, fillPrice, ... |
| `src/lib/calculators/liquidation.ts` | mmr, projectLiquidation, ratio, isLong, liquidation, ... |
| `src/lib/windows/fitContentHeight.ts` | header, min, FitContentMeasurement, computeFittedHeight, m |
| `src/lib/windows/implementations/CandleChartView.svelte` | priceDecimals, decimals, currentLastKline, update, e, ... |
| `src/stores/riskLimits.svelte.ts` | setLimit, key, RiskLimitInputs, value, raw, ... |
| `src/utils/chartDisplay.ts` | resolveChartPriceDecimals, quotePrecision, mode, fixedDecimals |
| `src/utils/server/venues/upstreamRetry.ts` | response, raw, retryAfterHeaderMs, seconds |
| `tests/gpu/f32Bound.ts` | perturbed, series, sensitivity, i, shifted, ... |

## Entry Points

- `src/components/shared/backgrounds/tradeFlow.worker.ts::animate`

## Connected Communities

- **stores · persist** (2 cross-edges)
- **backgrounds/engines · onTrade** (2 cross-edges)
- **services +46 dirs** (2 cross-edges)
- **benchmarks +11 dirs** (2 cross-edges)
- **backgrounds/engines +2 dirs · GalaxyFlowEngine** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)
- **shared/backgrounds · updateSettings** (1 cross-edges)
- **chart +3 dirs** (1 cross-edges)
- **shared/backgrounds · computeActivity** (1 cross-edges)
- **shared/backgrounds +2 dirs** (1 cross-edges)
- **backgrounds/engines +2 dirs · generate** (1 cross-edges)
- **backgrounds/engines · BlockEngine** (1 cross-edges)
- **utils +3 dirs · fill** (1 cross-edges)
- **components/shared +24 dirs** (1 cross-edges)
- **backgrounds/engines · percentileOfSorted** (1 cross-edges)
- **utils +15 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-289")
explore(operation:"context", task:"understand backgrounds/engines +11 dirs", format:"gcx")
relations(operation:"usages", target:{symbol:"src/components/shared/backgrounds/tradeFlow.worker.ts::animate"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
