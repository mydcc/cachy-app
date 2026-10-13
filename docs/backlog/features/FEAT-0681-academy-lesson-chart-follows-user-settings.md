---
id: FEAT-0681
title: Make the academy lesson chart follow the user's settings and show its formula
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: ADR-0025
depends_on: [FEAT-0677]
assignee: opencode
branch: feat/academy-lesson-settings
---

# FEAT-0681 — Make the academy lesson chart follow the user's settings and show its formula

## Problem

The "Indicators & Setups" tab (FEAT-0677) explains each indicator and draws it
over the live klines, but every number it shows is the catalogue's shipped
default and the timeframe is pinned to `1h`.

A trader who has configured the indicator in their own Technicals settings
therefore sees a lesson that does not match the chart they trade from: an EMA
taught at period 20 while their chart draws EMA 9/21, RSI taught at 14 while they
run 21. The lesson is about *their* indicator, so it should use *their* numbers.

The tab also cannot answer "where does this number come from?". The prose
describes the idea and never the arithmetic, and there is no formula anywhere in
the tab — unlike the two pattern tabs, which already render KaTeX.

## Proposal

Three changes to the lesson tab.

**1. The parameters follow the user's settings.** The mapping from a settings
card to engine parameters already exists and is tested:
`src/lib/alerts/indicatorSettingsSeed.ts` maps every settings card to its
catalogue id and its parameter readers, falling back to the catalogue default
per parameter it cannot supply. The lesson reuses that table instead of writing
a second mapping that could drift from it (it is the same table the alert seed
uses, so lesson, chart and alert cannot disagree). A non-localised module
derives the catalogue id → settings card direction from that table, and the
view passes the resolved parameters to the chart so the drawn line and the
Parameter card read the same numbers. The card marks a value that comes from the
user's own settings.

**2. The timeframe becomes selectable.** The lesson chart gets a small timeframe
selector, remembered across visits, driving both the drawn candles and the
indicator computation. The options are the user's configured analysis
timeframes, so this is a setting rather than a fourth hard-coded axis.

**3. A formula per indicator, typeset.** Every catalogue indicator gets a LaTeX
formula, rendered through the existing Markdown/KaTeX action the pattern tabs
already use. The formula is language-neutral, so it is not a localisation key —
matching how `params` and `placement` are already handled (ADR-0025).

## Acceptance criteria

- [x] The lesson chart computes each indicator with the parameters the Technicals
      settings configure for it, falling back to the catalogue default parameter
      by parameter where the settings card cannot supply one — pinned for every
      catalogue indicator by a test.
- [x] The Parameter card shows the value the chart actually uses and marks
      whether it comes from the user's settings or the catalogue default.
- [x] The lesson chart offers a timeframe selector; the choice is remembered and
      drives both the drawn candles and the indicator computation.
- [x] Every catalogue indicator has a formula, and the formula set is pinned to
      the registry so a new indicator without one fails CI.
- [x] Formulas render as typeset maths, not as raw LaTeX text.
- [x] `docs/adr/0025-academy-lesson-fields.md` records the formula as a display
      element that is neither a localisation key nor a fifth lesson field, with
      the reasoning.
- [x] `npm run backlog:check` passes.

## Out of scope

- **No change to `IndicatorLayer`.** The chart window's own rendering keeps its
  `SUB_PANES` behaviour; only the lesson chart changes.
- **No new indicator maths.** Every formula describes what the engine already
  computes.
- **No parameter-aware prose.** The four fields already say "the last N periods"
  rather than a number, so the text needs no change.
- **No SEO prose rewrite** for `src/lib/assets/content/academy.{de,en}.md`.

## Open questions

None.

## State

Shipped in the PR that carries this item (branch `feat/academy-lesson-settings`).
Three modules carry the feature: `src/lib/academy/lessonSettings.ts` (parameters
from `indicatorSettingsSeed`, lesson timeframes from `analysisTimeframes`),
`src/lib/academy/indicatorFormulas.ts` (the LaTeX map) and the two components
that read them. `computeLessonSeries` gained an optional `params` argument, so
omitting it keeps the pre-FEAT-0681 behaviour and the fan-out stays total.

Guards, each watched failing for its own reason before it was made green: the
mapping for every catalogue indicator, the card's marked value, the chart's
timeframe pick and its persistence, the parameter reaching the engine, the
formula set pinned to the catalogue, and the formula rendering as `.katex`
rather than as source.

One thing the change surfaced rather than caused: the Technicals default for the
first EMA is 21 while the catalogue's alert default is 20, so the lesson now
shows 21 where it used to show 20. That is the feature working — the card reports
what the chart draws — but it is a visible content change worth knowing about.

## Links

- FEAT-0677 — the tab, its lesson model and its live chart
- [`docs/adr/0025-academy-lesson-fields.md`](../../adr/0025-academy-lesson-fields.md) — why a formula is not a lesson field
- `src/lib/alerts/indicatorSettingsSeed.ts` — the settings → parameters table this reuses
- `src/lib/rules/indicatorSeries.ts` — the arithmetic a formula must describe
- `src/components/shared/IndicatorLessonChart.svelte` — the chart
- `src/components/shared/IndicatorLessonsView.svelte` — the tab
