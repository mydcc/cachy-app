---
id: BUG-0449
title: An HMA alert throws on every close and silences every rule after it on the same series
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: alerts
data_class: none
adr: none
depends_on: []
branch: fix/bug-0449-hma-alert-throws
start_date: 2026-09-13
---

# BUG-0449 — An HMA alert throws on every close and silences every rule after it on the same series

## Symptom

A trader arms an alert on HMA from the Indicators tab. It never fires. Worse, every
other rule alert on the same symbol and trigger timeframe that is stored after it
never fires either — an RSI alert, a Bollinger alert, a plain price rule. Nothing is
shown in the panel; the only trace is a `Rule evaluation failed for <symbol> <tf>`
line in the log on every candle close.

## Evidence

**Demonstrated.** Found while probing warmup lengths for FEAT-0446:

```
TypeError: Cannot read properties of undefined (reading 'wma')
 ❯ hma src/utils/indicators.ts:225:26
 ❯ computeIndicatorSeries src/lib/rules/indicatorSeries.ts:183:46
```

Reproduced by two loop tests and two series tests, all four failing before the fix:

- `ruleEvaluationLoop.test.ts` — "evaluates an HMA alert and the rules after it on the
  same series": expected `["hma", "after"]`, received `[]`
- `ruleEvaluationLoop.test.ts` — "still evaluates the other rules on a series when one
  rule's evaluation throws": expected `["after"]`, received `[]`
- `indicatorSeries.test.ts` — the catalogue walk and the HMA equality test: `TypeError`

## Cause

Two defects, one of which turns the other from a broken alert into broken alerts.

1. `computeIndicatorSeries` took the moving-average implementation off its object —
   `const fn = JSIndicators[indicator.id]; fn(close, period)`. EMA, SMA and WMA do not
   use `this`, so they worked. `hma` is built on `this.wma`, so a detached call threw.
   No test on this path had ever computed an HMA.
2. `RuleEvaluationLoop.evaluateSeries` evaluated rules in a plain loop. The throw
   escaped to `observeCandles`' catch-all, which is correct for the chart's write path
   but abandoned the remaining rules on that close.

## Fix

- `indicatorSeries.ts` calls through the object, so `this` is bound.
- `evaluateSeries` contains each rule's evaluation in its own `try`; a failure is logged
  against the rule id and the loop moves on. Deliberately **not** reported through
  `onUnevaluable`: that report tells the trader an alert "can never fire" and marks it
  in the panel, which a transient reader failure does not justify.
- The series test walks `INDICATOR_CATALOGUE` rather than a hand list: any line the path
  claims to support must produce numbers, so a newly supported indicator is exercised
  the moment it joins the set.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix
- [x] The test passes with the fix
- [x] One rule's thrown evaluation no longer prevents other rules on the same close from
      being evaluated, independently of the HMA cause
- [x] Every catalogue line `computeIndicatorSeries` claims to support is computed in a
      test

## Links

- `src/lib/rules/indicatorSeries.ts` — the detached call
- `src/services/alertEngine/ruleEvaluationLoop.ts` — `evaluateSeries`
- [`FEAT-0446`](../features/FEAT-0446-recorded-history-remaining-indicators.md) — the work that found it
