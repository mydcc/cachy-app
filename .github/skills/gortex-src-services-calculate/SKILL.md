---
name: gortex-src-services-calculate
description: "Work in the src/services · calculate area — 216 symbols across 2 files (91% cohesion)"
---

# src/services · calculate

216 symbols | 2 files | 91% cohesion

## When to Use

Use this skill when working on files in:
- `.worktrees/backlog-jcodemunch/src/services/technicalsTypes.ts`
- `.worktrees/backlog-jcodemunch/src/services/webGpuCalculator.ts`

## Key Files

| File | Symbols |
|------|---------|
| `.worktrees/backlog-jcodemunch/src/services/technicalsTypes.ts` | value, deriveChoppinessState |
| `.worktrees/backlog-jcodemunch/src/services/webGpuCalculator.ts` | o, results, val, data, wmaFull, ... |

## Entry Points

- `.worktrees/backlog-jcodemunch/src/services/webGpuCalculator.ts::WebGpuCalculator.calculate`

## Connected Communities

- **src/services +21 dirs** (11 cross-edges)
- **backlog-jcodemunch/src · calculateIndicatorsFromArrays** (11 cross-edges)
- **backlog-jcodemunch/src · toNumFast** (5 cross-edges)
- **src/services +1 dirs** (3 cross-edges)
- **src/services +11 dirs** (2 cross-edges)
- **src/services · verify** (1 cross-edges)
- **. +3 dirs · syncProjectKanbanStatus** (1 cross-edges)
- **lib/windows +10 dirs** (1 cross-edges)
- **backlog-jcodemunch/src · map** (1 cross-edges)
- **services +5 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-283")
explore(operation:"context", task:"understand src/services · calculate", format:"gcx")
relations(operation:"usages", target:{symbol:".worktrees/backlog-jcodemunch/src/services/webGpuCalculator.ts::WebGpuCalculator.calculate"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
