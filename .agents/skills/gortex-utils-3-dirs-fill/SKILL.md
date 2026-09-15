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
| `src/components/shared/backgrounds/engines/BlockEngine.ts` | dispose, cleanupResources |
| `src/components/shared/backgrounds/engines/GalaxyFlowEngine.ts` | onSymbolChange |
| `src/components/shared/backgrounds/engines/RaindropsEngine.ts` | context, constructor |
| `src/utils/indicatorTypes.ts` | NumberArray |
| `src/utils/indicators.ts` | JSIndicators.psar, spanBPeriod, JSIndicators.superTrend, combined, convLow, ... |
| `src/utils/mfi_correctness.test.ts` | sumPos, i, volume, tp, high, ... |
| `src/utils/slidingWindow.ts` | tail, period, slidingWindowMax, out, head, ... |
| `tests/benchmarks/mfi_optimization.bench.ts` | i, volume, period, j, tp, ... |
| `tests/benchmarks/wma_optimization.bench.ts` | period, data, sum, wmaLegacy, denominator, ... |

## Connected Communities

- **utils +10 dirs** (3 cross-edges)
- **utils · calculateADXSeries** (1 cross-edges)
- **services +5 dirs · safeDecimal** (1 cross-edges)
- **calculators +12 dirs** (1 cross-edges)
- **services +14 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-751")
explore(operation:"context", task:"understand utils +3 dirs · fill", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
