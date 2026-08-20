---
name: gortex-services-calculate
description: "Work in the services · calculate area — 218 symbols across 3 files (93% cohesion)"
---

# services · calculate

218 symbols | 3 files | 93% cohesion

## When to Use

Use this skill when working on files in:
- `src/services/apiService.ts`
- `src/services/technicalsTypes.ts`
- `src/services/webGpuCalculator.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/services/apiService.ts` | destroy |
| `src/services/technicalsTypes.ts` | deriveChoppinessState, value |
| `src/services/webGpuCalculator.ts` | calculateEma, low, hma, isAvailable, val, ... |

## Entry Points

- `src/services/webGpuCalculator.ts::WebGpuCalculator.calculate`

## Connected Communities

- **services +3 dirs · set** (8 cross-edges)
- **utils +1 dirs · toNumFast** (5 cross-edges)
- **services +1 dirs · MarketWatcher** (3 cross-edges)
- **src/services +11 dirs** (2 cross-edges)
- **services +4 dirs · error** (2 cross-edges)
- **src/services +21 dirs** (1 cross-edges)
- **services · verify** (1 cross-edges)
- **lib/windows +10 dirs** (1 cross-edges)
- **utils · calculateIndicatorsFromArrays** (1 cross-edges)
- **services +5 dirs** (1 cross-edges)
- **services · get** (1 cross-edges)
- **. +3 dirs · syncProjectKanbanStatus** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-773")
explore(operation:"context", task:"understand services · calculate", format:"gcx")
relations(operation:"usages", target:{symbol:"src/services/webGpuCalculator.ts::WebGpuCalculator.calculate"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
