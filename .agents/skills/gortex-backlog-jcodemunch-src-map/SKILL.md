---
name: gortex-backlog-jcodemunch-src-map
description: "Work in the backlog-jcodemunch/src · map area — 270 symbols across 7 files (77% cohesion)"
---

# backlog-jcodemunch/src · map

270 symbols | 7 files | 77% cohesion

## When to Use

Use this skill when working on files in:
- `.worktrees/backlog-jcodemunch/src/lib/calculators/stats.ts`
- `.worktrees/backlog-jcodemunch/src/lib/utils/timeUtils.ts`
- `.worktrees/backlog-jcodemunch/src/services/exchange/registry.ts`
- `.worktrees/backlog-jcodemunch/src/stores/ai.svelte.ts`
- `.worktrees/backlog-jcodemunch/src/utils/circularBuffer.ts`
- `.worktrees/backlog-jcodemunch/src/utils/indicators.ts`
- `.worktrees/backlog-jcodemunch/src/utils/technicalsPresenter.ts`

## Key Files

| File | Symbols |
|------|---------|
| `.worktrees/backlog-jcodemunch/src/lib/calculators/stats.ts` | hourlyGrossProfit, reorder, buckets, context, reorder, ... |
| `.worktrees/backlog-jcodemunch/src/lib/utils/timeUtils.ts` | diffDays, diffWeeks, diffMs, publishedDate, getRelativeTimeString, ... |
| `.worktrees/backlog-jcodemunch/src/services/exchange/registry.ts` | activeExchange |
| `.worktrees/backlog-jcodemunch/src/stores/ai.svelte.ts` | rrFormatted, klines, locale, account, lang, ... |
| `.worktrees/backlog-jcodemunch/src/utils/circularBuffer.ts` | U, map, i, callback, result |
| `.worktrees/backlog-jcodemunch/src/utils/indicators.ts` | c, period, close, slowSum, smoothingPeriod, ... |
| `.worktrees/backlog-jcodemunch/src/utils/technicalsPresenter.ts` | precision, formatVal, val |

## Entry Points

- `.worktrees/backlog-jcodemunch/src/stores/ai.svelte.ts::AiManager.gatherContext`

## Connected Communities

- **src/utils +6 dirs** (20 cross-edges)
- **lib/calculators +24 dirs** (10 cross-edges)
- **tests/benchmarks +12 dirs** (10 cross-edges)
- **services +8 dirs** (6 cross-edges)
- **lib/windows +10 dirs** (4 cross-edges)
- **src/services +21 dirs** (3 cross-edges)
- **src/services +11 dirs** (2 cross-edges)
- **src/services · getCoinMetadata** (2 cross-edges)
- **src/services +26 dirs** (2 cross-edges)
- **services/exchange · getExchangeAdapter · registry · types (8) #2** (1 cross-edges)
- **backlog-jcodemunch/src · calculateIndicatorsFromArrays** (1 cross-edges)
- **backlog-jcodemunch/src · syncService.syncBitunixPositions** (1 cross-edges)
- **src/services +33 dirs** (1 cross-edges)
- **services +30 dirs** (1 cross-edges)
- **src/utils · calculateADXSeries** (1 cross-edges)
- **services +5 dirs** (1 cross-edges)
- **utils/server +16 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-341")
explore(operation:"context", task:"understand backlog-jcodemunch/src · map", format:"gcx")
relations(operation:"usages", target:{symbol:".worktrees/backlog-jcodemunch/src/stores/ai.svelte.ts::AiManager.gatherContext"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
