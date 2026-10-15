---
id: FEAT-0679
title: Teach market structure, trend and regime in the Trading Academy
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0677]
---

# FEAT-0679 — Teach market structure, trend and regime in the Trading Academy

## Problem

The Academy teaches shapes on one timeframe and never says which timeframe decides
anything. A learner sees a double bottom on the 5m chart in a 4h downtrend and has no
vocabulary for why that bottom is worth less than it looks.

The missing layer is context: higher-timeframe bias, structural levels that persist,
and the distinction between a market that is trending and a market that is going
sideways. FEAT-0677 supplies indicators; this item supplies the frame those
indicators are read inside.

## Proposal

A fourth Academy tab, *Market Structure, Trend & Regime*, covering:

- **Multi-timeframe bias** — reading the higher timeframe first, and what "the 4h is
  bearish" actually commits you to.
- **Structure** — break of structure and change of character, swing highs and lows,
  and why they are drawn differently by everyone.
- **Levels that persist** — where support and resistance come from once the candles
  that made them are off screen.
- **Regime as reading, not classification** — trending versus ranging, expanding
  versus contracting volatility, and the indicators that stand in for each
  (ADX and Choppiness for trend versus range, Bollinger bandwidth and ATR for
  volatility expansion).

**The distinction this item depends on.** Regime is being taught *as content* — how a
trader reads the current regime from the chart, and which readings mislead. It is not
a feature that classifies the regime for the user. Automatic regime detection is
analysis work with its own accuracy questions, its own failure modes, and its own
review burden; folding it into a content tab would smuggle a classifier in under a
content label. If automatic detection is wanted, it is its own item and it should
argue for itself on its own evidence.

FEAT-0677's structure supplies the live view: the regime indicators named here are
already computed and already taught, so this tab references them rather than
recomputing or re-describing anything.

## Acceptance criteria

- [x] The tab defines regime terms in words and shows them on a chart, and does not
      state or imply a classification of the current market as a product feature.
- [x] Every indicator named is one FEAT-0677 already teaches; no indicator is
      introduced here that is not in `INDICATOR_CATALOGUE`.
- [x] Content covers what each reading is good for and what it is bad for — a regime
      indicator that is right in a trend and useless in a range says so.
- [x] The tab teaches completely offline, with no connection and no provider.
- [x] Structure definitions are drawn or shown consistently across both languages, and
      the DE and EN versions agree on the terms they use.
- [x] The tab obeys the same mobile rules as the existing tabs
      (`BUG-0047` — the Academy is currently not usable on a phone).

## Out of scope

- **Automatic regime detection or classification.** Explicitly a separate item.
- **A drawing tool** for marking swing points or levels on the user's own chart. That
  is chart interaction, not content, and it would be a considerably larger piece of
  work than this tab.
- **Re-teaching the indicators.** Link to FEAT-0677's lessons.
- **Timeframe-specific playbooks** for particular symbols or sessions.

## Open questions

- **How much of this is really structure and how much is already covered by chart
  patterns?** Decided 2026-10-14: reference-only. The tab names patterns and
  links the pattern tabs where they overlap; it never re-explains a formation.
- Whether the tab should be a lesson sequence with an order, or a reference the user
  jumps into. Decided 2026-10-14: reference with a numbered reading order
  (bias → structure → levels → regime). No progress state, no course machinery.
- Whether multi-timeframe comparison needs a split view. Decided 2026-10-14: no.
  Single chart with the existing timeframe switch (top-down workflow); split view
  stays an optional later item. Mobile gets stacking for free.

## Links

- FEAT-0677 — indicator lessons this builds on, and the regime indicators it names
- FEAT-0678 — the live-context feature on the same lessons
- FEAT-0686 — the live readings this tab later gained
- `src/lib/alerts/indicatorCatalogue.ts` — `INDICATOR_GROUP_ORDER`, where trend and
  volatility indicators already sit in groups
- BUG-0047 — Academy unusable on mobile