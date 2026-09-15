---
name: gortex-rules-3-dirs
description: "Work in the rules +3 dirs area — 297 symbols across 20 files (87% cohesion)"
---

# rules +3 dirs

297 symbols | 20 files | 87% cohesion

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
| `src/components/alerts/tabs/IndicatorsTab.svelte` | subjectRef, ref, chooseField, next, chosen |
| `src/lib/alerts/indicatorCatalogue.ts` | name, CatalogueParam, value, factor |
| `src/lib/alerts/indicatorSettingsSeed.test.ts` | leftOf, seed |
| `src/lib/alerts/indicatorSettingsSeed.ts` | mapping, drawn, ref, entry, declared, ... |
| `src/lib/rules/alertPathIndicators.ts` | indicatorId, field, indicator, effectiveFieldOf, referenceFieldFor |
| `src/lib/rules/indicatorMath.test.ts` | output, id, result, params, values |
| `src/lib/rules/indicatorRequests.ts` | field, found, takeOperand, timeframe, collectIndicators, ... |
| `src/lib/rules/indicatorSeries.test.ts` | bands, read, result, candlesIn, ref, ... |
| `src/lib/rules/indicatorSeries.ts` | low, period, low, close, singleLine, ... |
| `src/lib/rules/ruleEvaluationGate.test.ts` | lastAnchor, ctx, candles |
| `src/lib/rules/ruleSentence.test.ts` | field, cci |
| `src/lib/rules/types.ts` | AccountSnapshot, SizeBasis, IndicatorRef, EvaluationContext, DecimalString, ... |
| `src/services/alertEngine/correctedCandle.integration.test.ts` | contextFor, series, sma, result, series |
| `src/services/alertEngine/crossPathParity.test.ts` | jsSeries, ref, result |
| `src/services/alertEngine/indicatorConditions.integration.test.ts` | candles, indicator, indicators, output, rule, ... |
| `src/services/alertEngine/indicatorContext.test.ts` | readCandles, contextPassedToGate |
| `src/services/alertEngine/indicatorWarmup.ts` | IndicatorWarmup |
| `src/services/alertEngine/markCandleCache.test.ts` | close, time, candle |
| `src/services/alertEngine/recordedHistoryConditions.test.ts` | output, fullSeries, tail, candles, ruleWith, ... |
| `src/services/alertEngine/ruleEvaluationLoop.ts` | symbol, rule, triggerTimeframe, ctx, timeframe, ... |

## Connected Communities

- **alerts +2 dirs · cardAlertField** (4 cross-edges)
- **services +10 dirs · slice** (4 cross-edges)
- **utils +3 dirs · fill** (3 cross-edges)
- **services/alertEngine +4 dirs** (3 cross-edges)
- **utils +10 dirs** (3 cross-edges)
- **rules · takeOperand** (2 cross-edges)
- **services/alertEngine · push** (2 cross-edges)
- **services/alertEngine +1 dirs · refresh** (2 cross-edges)
- **calculators +12 dirs** (2 cross-edges)
- **services +14 dirs** (2 cross-edges)
- **services +30 dirs** (2 cross-edges)
- **services +4 dirs · normalizeTpSlRow** (1 cross-edges)
- **services/alertEngine +1 dirs · readRuleStates** (1 cross-edges)
- **alerts/tabs +4 dirs** (1 cross-edges)
- **services +5 dirs · ensureHistory** (1 cross-edges)
- **benchmarks +13 dirs** (1 cross-edges)
- **utils · calculateADXSeries** (1 cross-edges)
- **services +3 dirs · verify** (1 cross-edges)
- **rules +10 dirs** (1 cross-edges)

## How to Explore

```
analyze(operation:"communities", id:"community-330")
explore(operation:"context", task:"understand rules +3 dirs", format:"gcx")
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
