---
name: gortex-rules-3-dirs
description: "Work in the rules +3 dirs area — 288 symbols across 20 files (87% cohesion)"
---

# rules +3 dirs

288 symbols | 20 files | 87% cohesion

## When to Use

Use this skill when working on files in:
- `src/components/alerts/tabs/IndicatorsTab.svelte`
- `src/lib/alerts/indicatorCatalogue.ts`
- `src/lib/alerts/indicatorSettingsSeed.test.ts`
- `src/lib/alerts/indicatorSettingsSeed.ts`
- `src/lib/rules/alertPathIndicators.ts`
- `src/lib/rules/indicatorMath.test.ts`
- `src/lib/rules/indicatorRequests.ts`
- `src/lib/rules/indicatorSeries.test.ts`
- `src/lib/rules/indicatorSeries.ts`
- `src/lib/rules/ruleEvaluationGate.test.ts`
- `src/lib/rules/ruleSentence.test.ts`
- `src/lib/rules/types.ts`
- `src/services/alertEngine/correctedCandle.integration.test.ts`
- `src/services/alertEngine/crossPathParity.test.ts`
- `src/services/alertEngine/indicatorConditions.integration.test.ts`
- `src/services/alertEngine/indicatorContext.test.ts`
- `src/services/alertEngine/indicatorWarmup.ts`
- `src/services/alertEngine/markCandleCache.test.ts`
- `src/services/alertEngine/recordedHistoryConditions.test.ts`
- `src/services/alertEngine/ruleEvaluationLoop.ts`

## Key Files

| File | Symbols |
|------|---------|
| `src/components/alerts/tabs/IndicatorsTab.svelte` | chosen, ref, chooseField, subjectRef, next |
| `src/lib/alerts/indicatorCatalogue.ts` | value, CatalogueParam, name, factor |
| `src/lib/alerts/indicatorSettingsSeed.test.ts` | seed, leftOf |
| `src/lib/alerts/indicatorSettingsSeed.ts` | ref, refFor, declared, card, entry, ... |
| `src/lib/rules/alertPathIndicators.ts` | indicatorId, field, referenceFieldFor |
| `src/lib/rules/indicatorMath.test.ts` | params, values, id, output, result |
| `src/lib/rules/indicatorRequests.ts` | found, takeOperand, rule, walk, IndicatorRequest, ... |
| `src/lib/rules/indicatorSeries.test.ts` | bands, output, volumes, read, candles, ... |
| `src/lib/rules/indicatorSeries.ts` | i, bands, period, factor, base, ... |
| `src/lib/rules/ruleEvaluationGate.test.ts` | lastAnchor, ctx, candles |
| `src/lib/rules/ruleSentence.test.ts` | field, cci |
| `src/lib/rules/types.ts` | AccountSnapshot, EvaluationContext, PriceField, IndicatorRef, ParamValue, ... |
| `src/services/alertEngine/correctedCandle.integration.test.ts` | result, series, series, sma, contextFor |
| `src/services/alertEngine/crossPathParity.test.ts` | result, jsSeries, ref |
| `src/services/alertEngine/indicatorConditions.integration.test.ts` | id, output, index, indicator, request, ... |
| `src/services/alertEngine/indicatorContext.test.ts` | contextPassedToGate, readCandles |
| `src/services/alertEngine/indicatorWarmup.ts` | IndicatorWarmup |
| `src/services/alertEngine/markCandleCache.test.ts` | time, close, candle |
| `src/services/alertEngine/recordedHistoryConditions.test.ts` | coveredIndicators, indicator, ruleWith, indicators, series, ... |
| `src/services/alertEngine/ruleEvaluationLoop.ts` | ctx, triggerTimeframe, symbol, candles, indicators, ... |

## Connected Communities

- **services +10 dirs · slice** (4 cross-edges)
- **utils +3 dirs · fill** (3 cross-edges)
- **alerts +2 dirs · cardAlertField** (3 cross-edges)
- **services/alertEngine +4 dirs** (3 cross-edges)
- **utils +10 dirs** (3 cross-edges)
- **backgrounds/engines +11 dirs** (2 cross-edges)
- **rules · takeOperand** (2 cross-edges)
- **services/alertEngine · push** (2 cross-edges)
- **services/alertEngine +1 dirs · refresh** (2 cross-edges)
- **rules +9 dirs** (1 cross-edges)
- **alerts/tabs +4 dirs** (1 cross-edges)
- **services +4 dirs · normalizeTpSlRow** (1 cross-edges)
- **services +6 dirs · ensureHistory** (1 cross-edges)
- **benchmarks +11 dirs** (1 cross-edges)
- **services/alertEngine +1 dirs · readRuleStates** (1 cross-edges)
- **services/alertEngine · observeCandles** (1 cross-edges)
- **services +15 dirs** (1 cross-edges)
- **utils · calculateADXSeries** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)
- **services +29 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-317")
explore(operation:"context", task:"understand rules +3 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
