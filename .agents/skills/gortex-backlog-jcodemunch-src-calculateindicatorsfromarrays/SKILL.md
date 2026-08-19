---
name: gortex-backlog-jcodemunch-src-calculateindicatorsfromarrays
description: "Work in the backlog-jcodemunch/src · calculateIndicatorsFromArrays area — 393 symbols across 12 files (80% cohesion)"
---

# backlog-jcodemunch/src · calculateIndicatorsFromArrays

393 symbols | 12 files | 80% cohesion

## When to Use

Use this skill when working on files in:
- `.worktrees/backlog-jcodemunch/src/benchmarks/daily_perf_technicals.bench.ts`
- `.worktrees/backlog-jcodemunch/src/lib/calculators/charts.ts`
- `.worktrees/backlog-jcodemunch/src/lib/calculators/stats.ts`
- `.worktrees/backlog-jcodemunch/src/services/dataRepairService.ts`
- `.worktrees/backlog-jcodemunch/src/services/marketAnalyst.ts`
- `.worktrees/backlog-jcodemunch/src/services/technicalsTypes.ts`
- `.worktrees/backlog-jcodemunch/src/services/uiManager.ts`
- `.worktrees/backlog-jcodemunch/src/stores/journal.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/utils/circularBuffer.ts`
- `.worktrees/backlog-jcodemunch/src/utils/divergenceScanner.ts`
- `.worktrees/backlog-jcodemunch/src/utils/indicators.ts`
- `.worktrees/backlog-jcodemunch/src/utils/technicalsCalculator.ts`

## Key Files

| File | Symbols |
|------|---------|
| `.worktrees/backlog-jcodemunch/src/benchmarks/daily_perf_technicals.bench.ts` | count, price, i, generateKlines, klines |
| `.worktrees/backlog-jcodemunch/src/lib/calculators/charts.ts` | paths, idx50, currentLossStreak, closedTrades, lossStreakCounts, ... |
| `.worktrees/backlog-jcodemunch/src/lib/calculators/stats.ts` | sumR, grossLoss, context, j, tradeData, ... |
| `.worktrees/backlog-jcodemunch/src/services/dataRepairService.ts` | onProgress, onProgress, dataRepairService.repairMissingAtr, e, msPerCandle, ... |
| `.worktrees/backlog-jcodemunch/src/services/marketAnalyst.ts` | AnalystTechEntry |
| `.worktrees/backlog-jcodemunch/src/services/technicalsTypes.ts` | SerializedIndicatorResult, IndicatorResult |
| `.worktrees/backlog-jcodemunch/src/services/uiManager.ts` | visualBarContent, slPos, calculatedTpDetails, VisualBarContentItem, values, ... |
| `.worktrees/backlog-jcodemunch/src/stores/journal.svelte.ts` | updatedEntry, index, updateEntry |
| `.worktrees/backlog-jcodemunch/src/utils/circularBuffer.ts` | push, item |
| `.worktrees/backlog-jcodemunch/src/utils/divergenceScanner.ts` | values, indicatorName, i, priceHigh1, priceLow1, ... |
| `.worktrees/backlog-jcodemunch/src/utils/indicators.ts` | v, val, overbought, getRsiAction, oversold |
| `.worktrees/backlog-jcodemunch/src/utils/technicalsCalculator.ts` | mdi, e, key, srsiLen, kVal, ... |

## Entry Points

- `.worktrees/backlog-jcodemunch/src/services/dataRepairService.ts::dataRepairService.repairMfeMae@365`
- `.worktrees/backlog-jcodemunch/src/services/dataRepairService.ts::dataRepairService.repairMissingAtr@156`
- `.worktrees/backlog-jcodemunch/src/services/uiManager.ts::updateVisualBar`

## Connected Communities

- **lib/calculators +24 dirs** (29 cross-edges)
- **src/services +21 dirs** (21 cross-edges)
- **backlog-jcodemunch/src · map** (7 cross-edges)
- **backlog-jcodemunch/src · parseDecimal** (6 cross-edges)
- **services +30 dirs** (4 cross-edges)
- **services +8 dirs** (4 cross-edges)
- **tests/benchmarks +12 dirs** (2 cross-edges)
- **services +5 dirs** (2 cross-edges)
- **src/utils +6 dirs** (2 cross-edges)
- **lib/server +38 dirs** (2 cross-edges)
- **backlog-jcodemunch/src · checkPositionSize** (2 cross-edges)
- **. +3 dirs · syncProjectKanbanStatus** (2 cross-edges)
- **src/services +33 dirs** (1 cross-edges)
- **src/utils · calculatePivotsFromValues** (1 cross-edges)
- **services +9 dirs** (1 cross-edges)
- **src/utils · calculateADXSeries** (1 cross-edges)
- **src/services +26 dirs** (1 cross-edges)
- **backlog-jcodemunch · initialize** (1 cross-edges)
- **src/services +11 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-364")
explore(operation:"context", task:"understand backlog-jcodemunch/src · calculateIndicatorsFromArrays", format:"gcx")
relations(operation:"usages", target:{symbol:".worktrees/backlog-jcodemunch/src/services/dataRepairService.ts::dataRepairService.repairMfeMae@365"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
