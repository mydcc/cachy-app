---
id: BUG-0451
title: The alert panel offers fourteen indicators whose alerts can never fire
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: alerts
data_class: none
adr: none
depends_on: []
branch: fix/bug-0451-panel-offers-inert-indicators
start_date: 2026-09-13
---

# BUG-0451 — The alert panel offers fourteen indicators whose alerts can never fire

## Symptom

The Indicators tab, the combo builder and the create-alert action on the indicator
settings cards offered all 23 indicators the core registry accepts. For fourteen of them
— `stochastic`, `stoch_rsi`, `williams_r`, `cci`, `adx`, `ao`, `momentum`, `atr`,
`choppiness`, `super_trend`, `mfi`, `obv`, `parabolic_sar`, `ichimoku` — the alert path
has no JavaScript implementation. A trader could build and arm such an alert; it sat in
the panel looking live, and on its first candle close `RuleEvaluationLoop` reported it
as unevaluable ("Alerts that can never fire"). With the report set to "Log only", nothing
was shown at all.

## Evidence

**Demonstrated.** `computeIndicatorSeries` returns `unsupported` with
"has no JavaScript implementation on the alert path" for every id outside its supported
set of nine, while `INDICATOR_CATALOGUE` on develop listed all 23. Found while probing
warmup lengths for FEAT-0446.

## Cause

Two lists that had to agree and were maintained apart: `SUPPORTED` in
`indicatorSeries.ts` and the hand-written catalogue, which was only ever checked against
the core *registry* — what the core can validate — not against what the alert path can
compute.

## Fix

- `src/lib/rules/alertPathIndicators.ts` holds the nine computable ids once;
  `computeIndicatorSeries` and the catalogue both read it.
- `REGISTRY_CATALOGUE` keeps all 23, still held against the core registry so the mirror
  cannot drift. `INDICATOR_CATALOGUE` — which every builder, `catalogueEntry` and
  `indicatorsInGroup` resolve through — is the computable subset.
- `isAlertableIndicator` requires a computable indicator, not only a mapping, so a
  settings card's button and its seed cannot disagree. The card mapping itself stays
  complete and is still validated against the registry for every card, so it is correct
  on the day an indicator is wired in.
- `slotOf()` in `conditionSlots.ts` claims an indicator condition only while its id
  resolves through the catalogue. A draft saved on a now-hidden id is unclaimed —
  "unknown means keep" — so the Indicators tab's mount-time write cannot delete it.

Existing alerts on those indicators are not touched: they stay in the store, are still
reported as unevaluable, and a draft that holds one survives a tab switch. Wiring the
fourteen into the alert path is tracked in FEAT-0446 and adds each one back to the panel
in the same change.

## Acceptance criteria

- [x] The panel offers exactly the indicators the alert path computes, and each of them
      computes
- [x] The hidden indicators are pinned by name and resolve through none of the panel's
      lookups
- [x] A settings card shows the create-alert action exactly when a seed exists
- [x] The card mapping is still validated against the registry for every card
- [x] A draft holding one of the hidden indicators survives a tab switch instead of
      being claimed and cleared by the indicators builder

## Links

- `src/lib/rules/alertPathIndicators.ts`
- `src/lib/alerts/indicatorCatalogue.ts` — `REGISTRY_CATALOGUE`, `INDICATOR_CATALOGUE`
- `src/lib/alerts/indicatorSettingsSeed.ts` — `isAlertableIndicator`
- `src/lib/alerts/conditionSlots.ts` — `slotOf`, the claim that now follows the catalogue
- [`FEAT-0446`](../features/FEAT-0446-recorded-history-remaining-indicators.md) — found here; wiring the fourteen
- [`BUG-0449`](BUG-0449-hma-alert-throws-and-silences-series.md) — stacked on it: the "each one computes" check needs HMA fixed
