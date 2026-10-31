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

A **Kontext** block at the top of the Technicals panel body, switchable like
every other section through `indicatorSettings.panelSections`:

```
KONTEXT                         4h
Bias               EMA fallend · darunter
Struktur            BOS abwärts · 42
Widerstand                      76.954
Unterstützung                   76.208
Regime          ADX 16,8 < 25 · Chop 57,8
Volatilität      BW 1,3 % · ATR 336
```

- The bias timeframe is fixed one step above the analysis timeframe
  (`higherTimeframe()`), never configurable — the rule is part of the lesson.
- Thresholds sit inline (`16,8 < 25`), so a value carries its own reading.
- No expander, no click target, no second chart: five lines of text.
- The block reads from `computeStructureRead` and `recentLevels`; the ADX,
  Choppiness, bandwidth and ATR values come from the series the panel already
  has. A second kline channel carries the bias timeframe.

## Acceptance criteria

- [x] The block renders only when `indicatorSettings.panelSections.context` is
      true, and the toggle appears in the panel-sections settings like the
      others.
- [x] Six rows in the order bias → structure → resistance → support → regime →
      volatility; the header names the bias timeframe.
- [x] The structure row names the last BOS/CHoCH and its distance in candles;
      the level rows name the nearest swing resistance and support of the bias
      timeframe.
- [x] ADX, Choppiness, bandwidth and ATR carry their taught threshold inline.
- [x] No data renders `—`; no connection leaves the block empty without an
      error state.
- [x] No interaction: no expander, no navigation, no chart.
- [x] Colors come from CSS variables only.
- [x] New strings in `de.json` and `en.json`; `schema.d.ts` regenerated.
- [x] A component test pins the row order, the threshold rendering and the
      no-data fallback.

## Out of scope

- A configurable bias timeframe.
- Click-through from a row into the chart.
- Per-row explanations (that stays the Academy lesson's job, FEAT-0767).
- Replacing or reordering the existing raw lists in the panel.

## Links

- FEAT-0767 — the Academy tab reduced to the lesson behind this block
- FEAT-0765 — the structure read this block consumes
- `src/components/shared/TechnicalsPanel.svelte`
- `src/lib/academy/structureRead.ts`, `src/lib/academy/structureSignals.ts`
