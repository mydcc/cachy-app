---
name: gortex-src-utils-6-dirs
description: "Work in the src/utils +6 dirs area — 859 symbols across 15 files (92% cohesion)"
---

# src/utils +6 dirs

859 symbols | 15 files | 92% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `.worktrees/backlog-jcodemunch/src/components/shared/backgrounds/engines/BlockEngine.ts`
- `.worktrees/backlog-jcodemunch/src/components/shared/backgrounds/engines/RaindropsEngine.ts`
- `.worktrees/backlog-jcodemunch/src/utils/indicators.ts`
- `.worktrees/backlog-jcodemunch/src/utils/mfi_correctness.test.ts`
- `.worktrees/backlog-jcodemunch/src/utils/slidingWindow.ts`
- `.worktrees/backlog-jcodemunch/tests/benchmarks/mfi_optimization.bench.ts`
- `.worktrees/backlog-jcodemunch/tests/benchmarks/wma_optimization.bench.ts`
- `src/components/shared/backgrounds/engines/BlockEngine.ts`
- `src/components/shared/backgrounds/engines/RaindropsEngine.ts`
- `src/utils/indicators.ts`
- `src/utils/mfi_correctness.test.ts`
- `src/utils/slidingWindow.ts`
- `tests/benchmarks/mfi_optimization.bench.ts`
- `tests/benchmarks/wma_optimization.bench.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | fill |
| `.worktrees/backlog-jcodemunch/src/components/shared/backgrounds/engines/BlockEngine.ts` | dispose, cleanupResources |
| `.worktrees/backlog-jcodemunch/src/components/shared/backgrounds/engines/RaindropsEngine.ts` | constructor, context |
| `.worktrees/backlog-jcodemunch/src/utils/indicators.ts` | rows, low, end, period, loss, ... |
| `.worktrees/backlog-jcodemunch/src/utils/mfi_correctness.test.ts` | i, len, tp, i, negFlow, ... |
| `.worktrees/backlog-jcodemunch/src/utils/slidingWindow.ts` | tail, data, out, data, period, ... |
| `.worktrees/backlog-jcodemunch/tests/benchmarks/mfi_optimization.bench.ts` | close, i, len, result, low, ... |
| `.worktrees/backlog-jcodemunch/tests/benchmarks/wma_optimization.bench.ts` | i, out, wmaLegacy, result, data, ... |
| `src/components/shared/backgrounds/engines/BlockEngine.ts` | dispose, cleanupResources |
| `src/components/shared/backgrounds/engines/RaindropsEngine.ts` | constructor, context |
| `src/utils/indicators.ts` | meanDev, high, share, pooled, minLow, ... |
| `src/utils/mfi_correctness.test.ts` | i, moneyFlow, negFlow, sumPos, tp, ... |
| `src/utils/slidingWindow.ts` | i, out, data, deque, i, ... |
| `tests/benchmarks/mfi_optimization.bench.ts` | mfr, close, mfiLegacy, posFlow, low, ... |
| `tests/benchmarks/wma_optimization.bench.ts` | j, sum, denominator, result, period, ... |

## Connected Communities

- **utils +3 dirs** (2 cross-edges)
- **backlog-jcodemunch/src · JSIndicators.adx** (2 cross-edges)
- **lib/calculators +24 dirs** (2 cross-edges)
- **backlog-jcodemunch/src · map** (1 cross-edges)
- **calculators +2 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-398")
explore(operation:"context", task:"understand src/utils +6 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
