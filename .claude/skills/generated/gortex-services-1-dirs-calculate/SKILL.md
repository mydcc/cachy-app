---
name: gortex-services-1-dirs-calculate
description: "Work in the services +1 dirs · calculate area — 274 symbols across 3 files (93% cohesion)"
---

# services +1 dirs · calculate

274 symbols | 3 files | 93% cohesion

## When to Use

Use this skill when working on files in:
- `src/services/technicalsTypes.ts`
- `src/services/webGpuCalculator.ts`
- `tests/gpu/parityCases.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/services/technicalsTypes.ts` | deriveChoppinessState, value |
| `src/services/webGpuCalculator.ts` | st, useGpuForSma, calculateSuperTrend, bindGroup, kSmoothing, ... |
| `tests/gpu/parityCases.ts` | s, g, PARITY_CASES.gpu, PARITY_CASES.accumulates, PARITY_CASES.accumulates, ... |

## Entry Points

- `src/services/webGpuCalculator.ts::WebGpuCalculator.calculate`

## Connected Communities

- **services +2 dirs · set** (9 cross-edges)
- **services +4 dirs · toNumFast** (5 cross-edges)
- **services +6 dirs · dispatchMessage** (2 cross-edges)
- **utils +10 dirs** (1 cross-edges)
- **scripts +6 dirs** (1 cross-edges)
- **services +1 dirs · calculateBollinger** (1 cross-edges)
- **rules +9 dirs** (1 cross-edges)
- **services +5 dirs · encrypt** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)
- **services +15 dirs** (1 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (1 cross-edges)
- **services/alertEngine +4 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-636")
explore(operation:"context", task:"understand services +1 dirs · calculate", format:"gcx")
relations(operation:"usages", target:{symbol:"src/services/webGpuCalculator.ts::WebGpuCalculator.calculate"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
