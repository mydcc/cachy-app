---
name: gortex-services-3-dirs-calculate
description: "Work in the services +3 dirs · calculate area — 334 symbols across 11 files (84% cohesion)"
---

# services +3 dirs · calculate

334 symbols | 11 files | 84% cohesion

## When to Use

Use this skill when working on files in:
- `src/services/aggregatorService.ts`
- `src/services/alertEngine/ruleLifecycleView.ts`
- `src/services/apiService.ts`
- `src/services/bitunixWs.ts`
- `src/services/cloudService.rateLimit.test.ts`
- `src/services/externalDelivery.ts`
- `src/services/incrementalCache.ts`
- `src/services/technicalsTypes.ts`
- `src/services/webGpuCalculator.ts`
- `src/workers/technicals.worker.ts`
- `tests/gpu/parityCases.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/services/aggregatorService.ts` | id, analyze, AnalysisResult, journal, getJournalAnalysis |
| `src/services/alertEngine/ruleLifecycleView.ts` | alertId, validUntil, rule, firedCount, ruleId, ... |
| `src/services/apiService.ts` | constructor |
| `src/services/bitunixWs.ts` | commitThrottle, last, key, shouldBlock, key, ... |
| `src/services/cloudService.rateLimit.test.ts` | row, row, senderActivity.update, senderActivity.insert |
| `src/services/externalDelivery.ts` | body, to, form, from, apiKey, ... |
| `src/services/incrementalCache.ts` | result, key, symbol, timeframe, settings, ... |
| `src/services/technicalsTypes.ts` | deriveChoppinessState, value |
| `src/services/webGpuCalculator.ts` | high, val, calculateWma, volume, val, ... |
| `src/workers/technicals.worker.ts` | n, arr, resize |
| `tests/gpu/parityCases.ts` | PARITY_CASES.accumulates, g, PARITY_CASES.gpu, s, PARITY_CASES.gpu, ... |

## Entry Points

- `src/services/webGpuCalculator.ts::WebGpuCalculator.calculate`

## Connected Communities

- **services +4 dirs · toNumFast** (5 cross-edges)
- **utils +15 dirs** (5 cross-edges)
- **services +14 dirs** (4 cross-edges)
- **services · canUseIncremental** (3 cross-edges)
- **services +6 dirs · dispatchMessage** (2 cross-edges)
- **services +30 dirs** (2 cross-edges)
- **services +42 dirs** (2 cross-edges)
- **services +1 dirs · calculateBollinger** (1 cross-edges)
- **services/alertEngine +1 dirs · readRuleStates** (1 cross-edges)
- **scripts +6 dirs** (1 cross-edges)
- **rules +10 dirs** (1 cross-edges)
- **services +5 dirs · calculateIndicatorsFromArrays** (1 cross-edges)
- **utils +10 dirs** (1 cross-edges)
- **services +5 dirs · ensureHistory** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)
- **services · evictIfNeeded** (1 cross-edges)
- **services +3 dirs · deliverExternal** (1 cross-edges)
- **services/alertEngine +4 dirs** (1 cross-edges)
- **services +6 dirs · encrypt** (1 cross-edges)
- **calculators +12 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-644")
explore(operation:"context", task:"understand services +3 dirs · calculate", format:"gcx")
relations(operation:"usages", target:{symbol:"src/services/webGpuCalculator.ts::WebGpuCalculator.calculate"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
