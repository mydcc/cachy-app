---
id: FEAT-0677
title: Add an indicators category to the Trading Academy
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: ADR-0025
depends_on: []
---

# FEAT-0677 — Add an indicators category to the Trading Academy

## State

**Done.** All twelve acceptance criteria are met: the writing, the lesson model
and the tab merged earlier, and the live chart — AC 8 and AC 9 — ships with the
PR that closes this item.

Merged so far:

- #4045 — `docs/academy/`, 20 cards covering all 23 catalogue indicators
- #4051 — `academy.indicators.*`, 13 lessons for the trend and volatility groups
- #4053 — the remaining 10, completing oscillators and volume
- #4054 — [ADR-0025](../../adr/0025-academy-lesson-fields.md), the lesson fields
- #4056 — `placement` on `CatalogueEntry`, pinned against the cards
- #4057 — the lesson model and the corpus pin (`indicatorLessons.ts`,
  `indicatorLessons.test.ts`, plus the stale `TranslationKey` regeneration)

- #4058 — the third tab itself: the shared tab list, the panel switch, and the
  lesson view with search, group filter, favourites and the four fields
- the final slice (this PR) — the live chart: `IndicatorLessonChart.svelte`, its
  two component tests (`IndicatorLessonChart.component.test.ts`,
  `IndicatorLessonChart.refusal.component.test.ts`) and the
  `indicatorLessons.chart.*` strings

All 23 indicators in `REGISTRY_CATALOGUE` have all four prose keys in both
locales — 92 keys per locale, identical sets — and `indicatorLessons.test.ts`
resolves every key through `lessonKey` for both languages. With #4058 the
category became usable: ten of the twelve criteria were met, and what was left
was the live chart — AC 8, the indicator drawn over the selected symbol's klines,
and AC 9, every line the catalogue declares rendered on it. Both ship in the
final slice: `IndicatorLessonChart.svelte`, proved by
`IndicatorLessonChart.component.test.ts` (AC 8 and AC 9) and
`IndicatorLessonChart.refusal.component.test.ts` (a refused line is shown, not
silently dropped).

**The human read of the failure modes happened** and passed. That was the
documented gate on writing the DE/EN texts.

All three former open questions are answered, and the Open questions section says
so. Two were settled by the prose shipping; the third — lesson length, 76–148
words per `failureModes` — was decided by the owner.

**The lesson fields are settled by ADR-0025.** A lesson is exactly four
localisation keys: `whatItMeasures`, `howToRead`, `failureModes`,
`confirmation`. The item's own six-field list below over-counts: `params` is
already in the catalogue and resolves through `paramKey`, and the item's
`chartOverlay` ships as a typed catalogue property named `placement`. Neither is
a localisation key.

**`placement` is done.** `CatalogueEntry` carries a required
`placement: "price" | "pane"`, transcribed from the `On the chart` line of every
card and pinned against them by `indicatorCatalogue.test.ts`, so the field and
the cards cannot drift. Placement is **not** derivable from `dimension`: `ema`,
`atr`, `ao` and `momentum` each declare one `price` output and are drawn
differently — `ema` on the price, the other three on their own axis — and
`super_trend`, `parabolic_sar`, `ichimoku` and `bollinger` all declare multiple
`price` outputs and are all overlaid while `macd` is not. ADR-0025 carries the
evidence and a counter-example test keeps it from being re-derived. Merged in
#4056.

The lesson view exists since #4058. The chart over live klines ships in the
final slice: `IndicatorLessonChart.svelte` draws every declared output of the
open lesson over the klines of `tradeState.symbol` — the app-wide symbol
selection the calculator and the alert panel read — and redraws when it changes.
`placement: "price"` outputs are overlaid on the candle pane; `placement: "pane"`
outputs get their own axis below it. The component computes over the same engine
path `computeLessonSeries` wraps and never reuses `IndicatorLayer`, which decides
what to draw from the chart's own indicator settings rather than from an
argument.

**The multi-PR-claim note is retired.** Earlier slices kept the item `ready`
between PRs, because `scripts/check-stale-in-progress.mjs` fails an
`in-progress` item once the branch it names has merged, and this item spanned
several PRs — so any claim a slice took would have turned develop red as soon as
that branch merged. The final slice closes the item, so it is `done`.

**Not dispatched automatically.** `area: ui` is outside the auto-dispatch filters
in `.github/workflows/backlog-dispatch.yml`, so this item waits for a manual
handoff rather than going to Jules on its own.

**Lesson length is settled.** The merged prose runs 76–148 words per
`failureModes` field; the four fields together land at roughly one screen. That
range is the accepted length, not an accident of two writing passes — twenty-three
of these stay readable at it.

## Problem

The Academy teaches two kinds of shape — chart patterns and candlestick patterns —
and both answer the same question: *what do I see on the chart?* Nothing answers the
next question a trader actually has: *what state is the market in right now, and is
this a setup or just a shape?*

Cachy already computes twenty-three indicators over live data and already turns them
into alerts. The bridge from "an indicator" to "an indicator, explained" is missing,
so the learner reads the same line on their chart without knowing what it claims or
when it is lying.

## Proposal

A third Academy tab, *Indicators & Setups*, built on the catalogue the alert editor
already uses.

**Reuse, do not re-invent the registry.** `src/lib/alerts/indicatorCatalogue.ts`
already holds `INDICATOR_CATALOGUE` (line 296), `INDICATOR_GROUP_ORDER` (line 279),
`indicatorsInGroup` (line 319), and the localisation hooks `groupKey` (line 359) and
`groupHintKey` (line 362). The lesson list, its groups, its parameter rows and its
DE/EN strings all derive from that file. The authoritative list at runtime is the
WASM registry, `technicals-wasm/src/rule/indicator.rs::registry_json` (line 763),
exported as `rule_indicator_registry`
(`technicals-wasm/src/rule/exports.rs`, line 687). A lesson that names an indicator
the engine cannot compute is a defect, not a rounding error.

**Structure of a lesson.** Layered, and the second layer is what makes this worth
reading rather than a glossary:

- `whatItMeasures` — two or three sentences.
- `howToRead` — the three to five readings that actually mean something.
- **`failureModes`** — when the indicator is not telling you anything. This is the
  part almost every retail course leaves out, and it is where the category earns its
  keep.
- `confirmation` — the pattern or candle it pairs with to become a setup.
- `params` — name, default, and what the parameter does. Already in the catalogue.
- `chartOverlay` — line, band, histogram, or separate axis. Determines the renderer.

**The last two are not localisation keys** — see ADR-0025. `params` is read from
the catalogue through `paramKey`, and `chartOverlay` ships as the catalogue
property `placement` beside `dimension`. The four above are the lesson's shape.

All prose lives in `src/locales/locales/{de,en}.json` under `academy.indicators.*`.

**Live chart.** The lesson view renders the selected indicator over the live klines of
the currently selected symbol, using the same computation path the chart already
uses. This is the product handoff that chart patterns do not have: indicator →
lesson → alert template → alert.

**Panel switch.** `src/components/shared/AcademyContent.svelte` currently branches
with two-way `{#if}` / `{:else}`. A third tab needs a real `{#if}` / `{:else if}`
chain. `src/lib/academy/useAcademyTabs.svelte.ts` holds `ACADEMY_TABS`,
`isAcademyTab()` and `ACADEMY_TAB_STORAGE_KEY` — the tab is persisted, so a
stored id that is no longer known falls back to the default rather than
rendering nothing, which #4058 pins alongside the id it adds.

## Acceptance criteria

- [x] The Academy has a third tab that opens from both the window
      (`WindowManager.openAcademy`, line 379) and the SEO route
      (`src/routes/[[lang]]/(seo)/academy/+page.svelte`). *(Met in #4058: the tab
      is in `ACADEMY_TABS`, and the SEO route renders `AcademyContent` whole, so
      both entry points reach it.)*
- [x] The indicator list is derived from `INDICATOR_CATALOGUE`, not hand-maintained.
      Adding an indicator to the catalogue adds a lesson row with no edit here.
      *(Met in #4058: the list is `LESSON_GROUPS`, and the component test reads its
      expected row count from `REGISTRY_CATALOGUE` instead of naming a number.)*
- [x] Every lesson names an indicator present in `rule_indicator_registry`, asserted
      by a test. A lesson for an indicator the engine cannot compute fails CI.
      *(Met in #4057: the corpus is pinned to `REGISTRY_CATALOGUE`, which
      `indicatorCatalogue.test.ts` pins to `rule_indicator_registry()`.)*
- [x] Every parameter shown in a lesson matches the catalogue's parameter set and
      default for that indicator, also asserted by a test. *(Met in #4058: the
      detail pane renders `entry.params` through `paramKey`, and the component test
      asserts every name and default of the opened entry.)*
- [x] `de.json` and `en.json` carry the same key set under `academy.indicators.*`;
      a key present in one and missing in the other fails CI. *(Met for all 23 in
      #4057, asserted per locale rather than by comparing the two: each is checked
      against the registry id set and the four ADR-0025 field names.)*
- [x] A persisted tab id from before this change still resolves to a valid tab
      (`isAcademyTab`), and an unknown stored id falls back to the default tab
      instead of rendering nothing. *(Met in #4058, both halves asserted in
      `AcademyContent.component.test.ts`.)*
- [x] Each lesson has a non-empty `failureModes` entry in both languages. A lesson
      without one is treated as incomplete. *(Met for all 23 in #4057, alongside
      the other three fields.)*
- [x] The chart in a lesson view renders the indicator over the live klines of the
      currently selected symbol, and updates when the symbol changes. *(Met in
      `IndicatorLessonChart.svelte`: it reads `tradeState.symbol` — the app-wide
      selection — and that symbol's klines from `marketState`, holding the same
      `kline_1h` subscription a chart window does. `IndicatorLessonChart.component.test.ts`
      pins the draw against a seeded symbol, the empty state and the cleared
      series when the symbol changes to one with no klines, and the registration
      call per symbol.)*
- [x] Multi-output indicators render every line the catalogue declares —
      `macd` (macd / signal / histogram), `bollinger` (upper / middle / lower /
      percent_b / bandwidth), `adx` (adx / plus_di / minus_di), `super_trend`
      (value / upper / lower), `ichimoku` (conversion / base / span_a / span_b),
      `parabolic_sar` (value / direction), `stochastic` (k / d),
      `stoch_rsi` (k / d). *(Met in `IndicatorLessonChart.svelte`: it draws one
      line series per entry in `LessonSeries.lines`, whose fan-out is
      `computeLessonSeries` — pinned for all 23 indicators in
      `indicatorLessonSeries.test.ts`. `IndicatorLessonChart.component.test.ts`
      asserts, for every registry indicator with more than one declared output,
      that exactly that many line series are created and each carries points, and
      that `placement` decides the pane. A refused line is shown with its reason
      rather than silently dropped
      (`IndicatorLessonChart.refusal.component.test.ts`).)*
- [x] The category respects the existing favourites pattern from
      `ChartPatternsView` (`categories`, line 63-76) and the search and group filter
      behave the same as in the two existing tabs. *(Met in #4058: the same
      favourites hook under its own storage key, with search and the group filter
      covered by the component test.)*
- [x] `AcademyResponsive.component.test.ts` still passes — the new tab obeys the same
      mobile rules as the existing two. *(Met in #4058: the two tab-count pins moved
      to 3, and a third case holds the new tab to the same `expectFluidColumns`
      contract as the pattern views.)*
- [x] `npm run backlog:check` passes.

## Content notes — the details a wrong lesson would teach

These are the places where a plausible-sounding explanation is wrong. They belong in
`failureModes` or `howToRead`, and they are asserted against the implementation, not
against the catalogue:

- `bollinger` `bandwidth` is **scaled by 100** and printed as a percentage, matching
  the chart panel. The bare ratio is the more common convention elsewhere and is
  deliberately not used. A trader who reads `2.41%` on the panel and writes
  `bandwidth < 2.41` gets a condition true on every candle. See the comment on the
  derived output in `src/lib/rules/indicatorSeries.ts`.
- Ichimoku is computed with a fixed `ICHIMOKU_DISPLACEMENT`
  (`src/lib/rules/alertPathIndicators.ts`, line 71). A lesson must not present
  displacement as a free parameter.
- ADX uses one period for both the directional smoothing and the ADX's own window.
- Warmup windows are **indeterminate, not zero**. `NaN` becomes `null`. The exception
  is ATR, where a zero is a real reading (no movement at all) and is kept.
- `parabolic_sar` `direction` is the side the SAR stands on, not its level. "The SAR
  flips" is `direction` crossing zero.
- Warmup windows and rangeless windows differ per indicator. A lesson that says "the
  first N candles are blank" without saying which N is not yet written.

## Out of scope

- **No AI-generated runtime text.** Baseline prose is written and reviewed by hand.
  See FEAT-0678.
- **No automatic regime detection.** Regime as *content* is FEAT-0679; classifying
  the current market automatically is a separate piece of analysis work and does not
  belong in a content tab.
- **No new indicator maths.** Every indicator listed is already computed by
  `computeIndicatorSeries` (`src/lib/rules/indicatorSeries.ts`, line 244) or the WASM
  core. Adding an indicator to the engine is separate work.
- **No images or video per lesson.** If a lesson needs a picture of the shape, that is
  a separate item; this one is text plus a live chart.
- **No SEO prose rewrite** for `src/lib/assets/content/academy.{de,en}.md`.

## Open questions

None outstanding. All three are answered and the answers are recorded above, so
this section is kept only to say that there is nothing left to decide about the
prose. Resolved:

- *Which indicators land in the first PR* — answered by shipping all of them:
  trend and volatility in #4051, oscillators and volume in #4053. The grouping
  turned out to be the right split for review, not for scope.
- *How long is a lesson* — 76–148 words per `failureModes`, about one screen for
  the four fields together.
- *Whether `failureModes` may carry a conditional example* — prose-only. A
  condition such as "+DI above −DI with ADX high" belongs in `howToRead`, where
  it reads as guidance rather than as a caveat, and the four-field shape in
  ADR-0025 is what keeps that decision enforceable.

## Links

- [`docs/adr/0025-academy-lesson-fields.md`](../../adr/0025-academy-lesson-fields.md) —
  the four lesson fields, and why `params` and the placement field are not localisation keys
- `src/lib/alerts/indicatorCatalogue.ts` — the registry this reuses
- `src/lib/rules/indicatorSeries.ts` — `computeIndicatorSeries`, the computation
- `technicals-wasm/src/rule/indicator.rs` — `registry_json`, the authoritative list
- `src/components/shared/AcademyContent.svelte` — the panel switch to rewrite
- `src/lib/academy/useAcademyTabs.svelte.ts` — tab ids and persistence
- `src/components/shared/ChartPatternsView.svelte` — the pattern to follow
- `docs/adr/0001-local-first-boundary.md`
- `BUG-0047` — academy unusable on mobile; the new tab must not repeat it