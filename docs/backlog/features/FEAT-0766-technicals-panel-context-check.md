---
id: FEAT-0766
title: Put the market-context check into the Technicals panel
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0765]
assignee: opencode
branch: feature/feat-0766-context-check
---

# FEAT-0766 — Put the market-context check into the Technicals panel

## Problem

The Technicals panel lists raw measurements for one timeframe: ATR, Bollinger
bandwidth, ADX with DI+/DI-, Choppiness, pivots, moving averages, the last
structure high and low. The trader still has to do the reading themselves:
which timeframe sets the bias, whether the last break continued the trend or
warned of a reversal, whether the nearest level is in the way, whether the
regime makes an indicator readable at all, and whether volatility fits the
stop. The Academy tab taught that order, but it sits one tab away from the
moment the decision is made — so it is read once and never opened again.

## Proposal

A **Kontext** block that sits directly above the signal list and below the raw
lists, switchable like every other section through
`indicatorSettings.panelSections` (the summary stays the first thing read).
The toggle list in the panel configuration follows the same order as the
panel body, so it reads as a map of the panel:

```
KONTEXT
Bias 4h                EMA 21 fallend · darunter
Struktur 1h            BOS abwärts · 42 Kerzen
Widerstand 4h                          76.954
Unterstützung 4h                       76.208
```

Every row names its own timeframe: direction and levels run on the bias
timeframe, structure on the analysis one.

The block carries only what the panel does not already answer. ADX,
Choppiness, bandwidth and ATR were rows in the first version, carrying their
taught thresholds inline — but the panel renders those same four numbers
above, together with more context than a threshold (ADX with trend and
DI+/DI-, Choppiness with its state). Two rows for one measurement claimed a
second measurement existed; the follow-up removed them and the thresholds
went back to the Academy lesson that teaches them.

- The bias timeframe is fixed one step above the analysis timeframe
  (`higherTimeframe()`), never configurable — the rule is part of the lesson.
- No expander, no click target, no second chart: four lines of text.
- The block reads from `computeStructureRead` and `recentLevels`. A second
  kline channel carries the bias timeframe; nothing else is computed twice.

## Acceptance criteria

- [x] The block renders only when `indicatorSettings.panelSections.context` is
      true, and the toggle appears in the panel-sections settings like the
      others.
- [x] Four rows in the order bias → structure → resistance → support; every
      row names its own timeframe.
- [x] No row repeats a value the panel already prints in its own section.
- [x] The structure row names the last BOS/CHoCH and its distance in candles,
      with a distinct wording for the forming candle and for a single candle;
      the level rows name the nearest swing resistance and support of the bias
      timeframe.
- [x] No data renders `—`; no connection leaves the block empty without an
      error state.
- [x] No interaction: no expander, no navigation, no chart.
- [x] Colors come from CSS variables only.
- [x] New strings in `de.json` and `en.json`; `schema.d.ts` regenerated.
- [x] A component test pins the row order, the absence of the duplicated
      regime rows, the no-data fallback, the levels coming from the bias
      timeframe and the channel being registered and released.
- [x] The block renders directly above the signal list, with the summary still
      the first row of the panel, and the visibility toggles are listed in the
      panel's render order.

## Out of scope

- A configurable bias timeframe.
- Click-through from a row into the chart.
- Per-row explanations (that stays the Academy lesson's job, FEAT-0767).
- Replacing or reordering the existing raw lists in the panel.
- Per-row thresholds for ADX and Choppiness: those rows were removed again
  because they duplicated the raw lists. The lesson teaches the thresholds.

## Links

- FEAT-0767 — the Academy tab reduced to the lesson behind this block
- FEAT-0765 — the structure read this block consumes
- `src/components/shared/TechnicalsPanel.svelte`
- `src/lib/academy/structureRead.ts`, `src/lib/academy/structureSignals.ts`
