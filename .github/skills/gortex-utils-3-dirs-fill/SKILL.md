---
name: gortex-utils-3-dirs-fill
description: "Work in the utils +3 dirs · fill area — 450 symbols across 10 files (92% cohesion)"
---

# utils +3 dirs · fill

450 symbols | 10 files | 92% cohesion

## When to Use

Use this skill when working on files in:
- ``
- `src/components/shared/backgrounds/engines/BlockEngine.ts`
- `src/components/shared/backgrounds/engines/GalaxyFlowEngine.ts`
- `src/components/shared/backgrounds/engines/RaindropsEngine.ts`
- `src/utils/indicatorTypes.ts`
- `src/utils/indicators.ts`
- `src/utils/mfi_correctness.test.ts`
- `src/utils/slidingWindow.ts`
- `tests/benchmarks/mfi_optimization.bench.ts`
- `tests/benchmarks/wma_optimization.bench.ts`

## Key Files

| File | Symbols |
|------|---------|
| `` | fill |
| `src/components/shared/backgrounds/engines/BlockEngine.ts` | cleanupResources, dispose |
| `src/components/shared/backgrounds/engines/GalaxyFlowEngine.ts` | onSymbolChange |
| `src/components/shared/backgrounds/engines/RaindropsEngine.ts` | context, constructor |
| `src/utils/indicatorTypes.ts` | NumberArray |
| `src/utils/indicators.ts` | outMiddle, sumLoss, lowestLows, period, result, ... |
| `src/utils/mfi_correctness.test.ts` | i, period, mfiLegacy, moneyFlow, mfr, ... |
| `src/utils/slidingWindow.ts` | out, deque, period, tail, len, ... |
| `tests/benchmarks/mfi_optimization.bench.ts` | j, negFlow, tp, i, posFlow, ... |
| `tests/benchmarks/wma_optimization.bench.ts` | j, data, out, sum, result, ... |

## Connected Communities

- **utils +10 dirs** (3 cross-edges)
- **utils · calculateADXSeries** (1 cross-edges)
- **services +4 dirs · queueSubscription** (1 cross-edges)
- **calculators +12 dirs** (1 cross-edges)
- **services +14 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-751")
explore(operation:"context", task:"understand utils +3 dirs · fill", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
