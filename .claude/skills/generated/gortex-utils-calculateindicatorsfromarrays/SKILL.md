---
name: gortex-utils-calculateindicatorsfromarrays
description: "Work in the utils · calculateIndicatorsFromArrays area — 240 symbols across 3 files (88% cohesion)"
---

# utils · calculateIndicatorsFromArrays

240 symbols | 3 files | 88% cohesion

## When to Use

Use this skill when working on files in:
- `src/utils/divergenceScanner.ts`
- `src/utils/indicators.ts`
- `src/utils/technicalsCalculator.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/utils/divergenceScanner.ts` | highPivots, seen, i, bestRegular, getMinInWindow, ... |
| `src/utils/indicators.ts` | oldSlow, slowSum, high, oldFast, overbought, ... |
| `src/utils/technicalsCalculator.ts` | range, calculateMA, src, trend, closesNum, ... |

## Connected Communities

- **calculators +6 dirs** (23 cross-edges)
- **lib/calculators +24 dirs** (6 cross-edges)
- **services +4 dirs · error** (5 cross-edges)
- **services +30 dirs** (2 cross-edges)
- **tests/benchmarks +12 dirs** (2 cross-edges)
- **src/utils +6 dirs** (2 cross-edges)
- **utils · calculateADXSeries** (1 cross-edges)
- **utils · calculatePivotsFromValues** (1 cross-edges)
- **components/shared +4 dirs · update** (1 cross-edges)
- **services +4 dirs · ensureHistory** (1 cross-edges)
- **src/services +11 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-863")
explore(operation:"context", task:"understand utils · calculateIndicatorsFromArrays", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
