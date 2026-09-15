---
name: gortex-chart-3-dirs
description: "Work in the chart +3 dirs area — 237 symbols across 6 files (91% cohesion)"
---

# chart +3 dirs

237 symbols | 6 files | 91% cohesion

## When to Use

Use this skill when working on files in:
- `src/lib/chart/indicatorLayer.test.ts`
- `src/lib/chart/indicatorLayer.ts`
- `src/lib/chart/seriesMap.ts`
- `src/lib/rules/indicatorSeries.test.ts`
- `src/lib/windows/implementations/CandleChartView.svelte`
- `src/services/paperTrading_seam.test.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/chart/indicatorLayer.test.ts` | fullRender, makeChart, MockPane, env, height, ... |
| `src/lib/chart/indicatorLayer.ts` | last, stripsClaimed, createdPaneIndices, source, s, ... |
| `src/lib/chart/seriesMap.ts` | out, rows, SourceKind, i, rows, ... |
| `src/lib/rules/indicatorSeries.test.ts` | field, column, flattenedTo |
| `src/lib/windows/implementations/CandleChartView.svelte` | el, instance, name, instance, danger, ... |
| `src/services/paperTrading_seam.test.ts` | symbol, position |

## Connected Communities

- **utils +10 dirs** (11 cross-edges)
- **services +14 dirs** (5 cross-edges)
- **services +4 dirs · queueSubscription** (3 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (3 cross-edges)
- **chart · subPaneContent** (2 cross-edges)
- **chart · makeState** (2 cross-edges)
- **services +5 dirs · ensureHistory** (2 cross-edges)
- **benchmarks +13 dirs** (1 cross-edges)
- **utils · calculatePivotsFromValues** (1 cross-edges)
- **. +2 dirs · calculateStep** (1 cross-edges)
- **components/shared +6 dirs · querySelectorAll** (1 cross-edges)
- **src/lib +2 dirs · readCssColor** (1 cross-edges)
- **calculators +12 dirs** (1 cross-edges)
- **stores +2 dirs · ResultsManager** (1 cross-edges)
- **components/shared +2 dirs · handleTpSlDrop** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-310")
explore(operation:"context", task:"understand chart +3 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
