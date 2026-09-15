---
name: gortex-services-5-dirs-calculateindicatorsfromarrays
description: "Work in the services +5 dirs · calculateIndicatorsFromArrays area — 350 symbols across 17 files (78% cohesion)"
---

# services +5 dirs · calculateIndicatorsFromArrays

350 symbols | 17 files | 78% cohesion

## When to Use

Use this skill when working on files in:
- `src/lib/calculators/charts.ts`
- `src/lib/calculators/stats.ts`
- `src/lib/notificationPolicy.ts`
- `src/services/incrementalCache.test.ts`
- `src/services/incrementalCache.ts`
- `src/services/marketAnalyst.ts`
- `src/services/notificationService.svelte.ts`
- `src/services/technicalsService.ts`
- `src/services/technicalsTypes.ts`
- `src/services/uiManager.ts`
- `src/stores/market/klineBuffers.ts`
- `src/stores/settings/aiProviders.ts`
- `src/utils/appReset.test.ts`
- `src/utils/circularBuffer.ts`
- `src/utils/divergenceScanner.ts`
- `src/utils/indicators.ts`
- `src/utils/technicalsCalculator.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/calculators/charts.ts` | idx10, randomPaths, journal, simulations, horizon, ... |
| `src/lib/calculators/stats.ts` | startIdx, grossLoss, variance, journal, pf, ... |
| `src/lib/notificationPolicy.ts` | notificationKey, category, orderId |
| `src/services/incrementalCache.test.ts` | generateMockResult |
| `src/services/incrementalCache.ts` | IncrementalCacheEntry |
| `src/services/marketAnalyst.ts` | AnalystTechEntry |
| `src/services/notificationService.svelte.ts` | key, isDuplicate, last, request, external, ... |
| `src/services/technicalsService.ts` | TechnicalsResultCacheEntry |
| `src/services/technicalsTypes.ts` | DivergenceItem, SerializedDivergenceItem, IndicatorResult, SerializedTechnicalsData, TechnicalsData, ... |
| `src/services/uiManager.ts` | values, visualBarContent, slPos, entryPos, highestPrice, ... |
| `src/stores/market/klineBuffers.ts` | isAppend, offset, newKlines, j, i, ... |
| `src/stores/settings/aiProviders.ts` | validateProviderConfig, errors, baseUrl, ValidateProviderConfigOptions, ProviderConfigError, ... |
| `src/utils/appReset.test.ts` | name, constructor |
| `src/utils/circularBuffer.ts` | item, push |
| `src/utils/divergenceScanner.ts` | j, pivots, DivergenceScanner, key, end, ... |
| `src/utils/indicators.ts` | v, oversold, getRsiAction, overbought, val |
| `src/utils/technicalsCalculator.ts` | fac, last, bVal, stochSmooth, sbVal, ... |

## Entry Points

- `src/services/uiManager.ts::updateVisualBar`

## Connected Communities

- **services +14 dirs** (15 cross-edges)
- **services +4 dirs · parseDecimal** (6 cross-edges)
- **utils +15 dirs** (5 cross-edges)
- **utils +10 dirs** (5 cross-edges)
- **stores/settings · sanitizeUserProviders** (4 cross-edges)
- **services +42 dirs** (4 cross-edges)
- **calculators +12 dirs** (3 cross-edges)
- **services +10 dirs · slice** (3 cross-edges)
- **services +5 dirs · ensureHistory** (2 cross-edges)
- **services +6 dirs · dispatchMessage** (2 cross-edges)
- **services +3 dirs · deliverExternal** (2 cross-edges)
- **utils +3 dirs · fill** (2 cross-edges)
- **benchmarks +13 dirs** (2 cross-edges)
- **rules +10 dirs** (2 cross-edges)
- **services +1 dirs · t** (1 cross-edges)
- **services +6 dirs · encrypt** (1 cross-edges)
- **services +2 dirs · schedule** (1 cross-edges)
- **services +10 dirs · appFetch** (1 cross-edges)
- **services +2 dirs · syncService.syncBitunixPositions** (1 cross-edges)
- **utils · calculatePivotsFromValues** (1 cross-edges)
- **utils · calculateADXSeries** (1 cross-edges)
- **utils · calculateAwesomeOscillator** (1 cross-edges)
- **settings/tabs +1 dirs · NotificationService** (1 cross-edges)
- **utils +3 dirs · release** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-779")
explore(operation:"context", task:"understand services +5 dirs · calculateIndicatorsFromArrays", format:"gcx")
relations(operation:"usages", target:{symbol:"src/services/uiManager.ts::updateVisualBar"}, format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
