---
name: gortex-calculators-2-dirs
description: "Work in the calculators +2 dirs area — 198 symbols across 5 files (69% cohesion)"
---

# calculators +2 dirs

198 symbols | 5 files | 69% cohesion

## When to Use

Use this skill when working on files in:
- `.worktrees/backlog-jcodemunch/src/components/shared/OrderHistoryList.svelte`
- `src/lib/calculators/charts.ts`
- `src/lib/calculators/stats.ts`
- `src/utils/circularBuffer.ts`
- `src/utils/indicators.ts`

## Key Files

| File | Symbols |
|------|---------|
| `.worktrees/backlog-jcodemunch/src/components/shared/OrderHistoryList.svelte` | em, endTime, sm, startTime, sy, ... |
| `src/lib/calculators/charts.ts` | journal, bottomSymbols, shortPnl, symbolMap, getDirectionData, ... |
| `src/lib/calculators/stats.ts` | journal, labels, arr, dayGrossLoss, dayGrossProfit, ... |
| `src/utils/circularBuffer.ts` | i, result, callback, map, U |
| `src/utils/indicators.ts` | h, volume, h, l, time, ... |

## Connected Communities

- **src/utils +6 dirs** (20 cross-edges)
- **lib/calculators +24 dirs** (14 cross-edges)
- **calculators +6 dirs** (3 cross-edges)
- **services +8 dirs** (2 cross-edges)
- **utils · calculateADXSeries** (1 cross-edges)
- **lib/windows +10 dirs** (1 cross-edges)
- **utils · calculateIndicatorsFromArrays** (1 cross-edges)
- **src/services +26 dirs** (1 cross-edges)
- **api/klines +1 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-837")
explore(operation:"context", task:"understand calculators +2 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
