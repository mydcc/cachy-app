---
id: FEAT-0677
title: Add an indicators category to the Trading Academy
type: feature
status: in-progress
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# FEAT-0677 — Add an indicators category to the Trading Academy

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

All prose lives in `src/locales/locales/{de,en}.json` under `academy.indicators.*`.

**Live chart.** The lesson view renders the selected indicator over the live klines of
the currently selected symbol, using the same computation path the chart already
uses. This is the product handoff that chart patterns do not have: indicator →
lesson → alert template → alert.

**Panel switch.** `src/components/shared/AcademyContent.svelte` currently branches
with two-way `{#if}` / `{:else}`. A third tab needs a real `{#if}` / `{:else if}`
chain. `src/lib/academy/useAcademyTabs.svelte.ts` holds `TABS` (line 30),
`isAcademyTab()` (line 32) and `ACADEMY_TAB_STORAGE_KEY` (line 28) — the tab is
persisted, so a new id needs a migration or it disappears for existing users.

## Acceptance criteria

- [ ] The Academy has a third tab that opens from both the window
      (`WindowManager.openAcademy`, line 379) and the SEO route
      (`src/routes/[[lang]]/(seo)/academy/+page.svelte`).
- [ ] The indicator list is derived from `INDICATOR_CATALOGUE`, not hand-maintained.
      Adding an indicator to the catalogue adds a lesson row with no edit here.
- [ ] Every lesson names an indicator present in `rule_indicator_registry`, asserted
      by a test. A lesson for an indicator the engine cannot compute fails CI.
- [ ] Every parameter shown in a lesson matches the catalogue's parameter set and
      default for that indicator, also asserted by a test.
- [ ] `de.json` and `en.json` carry the same key set under `academy.indicators.*`;
      a key present in one and missing in the other fails CI.
- [ ] A persisted tab id from before this change still resolves to a valid tab
      (`isAcademyTab`), and an unknown stored id falls back to the default tab
      instead of rendering nothing.
- [ ] Each lesson has a non-empty `failureModes` entry in both languages. A lesson
      without one is treated as incomplete.
- [ ] The chart in a lesson view renders the indicator over the live klines of the
      currently selected symbol, and updates when the symbol changes.
- [ ] Multi-output indicators render every line the catalogue declares —
      `macd` (macd / signal / histogram), `bollinger` (upper / middle / lower /
      percent_b / bandwidth), `adx` (adx / plus_di / minus_di), `super_trend`
      (value / upper / lower), `ichimoku` (conversion / base / span_a / span_b),
      `parabolic_sar` (value / direction), `stochastic` (k / d),
      `stoch_rsi` (k / d).
- [ ] The category respects the existing favourites pattern from
      `ChartPatternsView` (`categories`, line 63-76) and the search and group filter
      behave the same as in the two existing tabs.
- [ ] `AcademyResponsive.component.test.ts` still passes — the new tab obeys the same
      mobile rules as the existing two.
- [ ] `npm run backlog:check` passes.

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

- Which indicators land in the first PR? All twenty-three at once is a lot of
  reviewed text in two languages. The grouping in `INDICATOR_GROUP_ORDER` gives a
  natural first slice — trend and volatility, which is also where the failure modes
  are most instructive.
- How long is a lesson? Long enough to be worth reading, short enough that twenty-three
  of them stay readable.
- Is `failureModes` prose-only, or may it carry a small conditional example
  ("RSI above 70 in a ranging market")? Prose-only is the honest default.

## Links

- `src/lib/alerts/indicatorCatalogue.ts` — the registry this reuses
- `src/lib/rules/indicatorSeries.ts` — `computeIndicatorSeries`, the computation
- `technicals-wasm/src/rule/indicator.rs` — `registry_json`, the authoritative list
- `src/components/shared/AcademyContent.svelte` — the panel switch to rewrite
- `src/lib/academy/useAcademyTabs.svelte.ts` — tab ids and persistence
- `src/components/shared/ChartPatternsView.svelte` — the pattern to follow
- `docs/adr/0001-local-first-boundary.md`
- `BUG-0047` — academy unusable on mobile; the new tab must not repeat it