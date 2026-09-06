---
id: FEAT-0403
title: Toggle chart indicator panes per indicator in Settings
type: feature
status: done
assignee: opencode
branch: feat/chart-pane-collapse
priority: P2
milestone: M3
editions: [community, pro, private]
area: chart
data_class: none
adr: none
depends_on: [FEAT-0400]
estimate: 2
size: S
target_date: 2026-09-18
start_date: 2026-09-05
---

# FEAT-0403 — Toggle chart indicator panes per indicator in Settings

## Problem

Every indicator that is enabled for the Technicals panel always draws its
sub-pane in the chart window. A user who wants to see only 1 of 3 enabled
indicators in the chart has no way to do that: collapsing (FEAT-0400) only
shrinks a pane to a strip, and disabling the indicator removes it from the
Technicals panel as well — where it should keep calculating and stay visible.

Chart-pane visibility and Technicals-panel membership need to be separate
switches, with a dedicated place in Settings to control the chart side.

## Proposal

- Add a per-indicator `showInChart` flag (default `true`), persisted in the
  indicator store with migration, for every indicator that can claim a chart
  sub-pane (volume, rsi, macd, stochRsi, cci, momentum, williamsR, obv, mfi,
  adx, ao, choppiness, stochastic) plus the Bollinger Bands and Pivot
  price-pane overlays.
- Add a new "Chart" tab to the Technicals settings listing exactly those
  indicators with one toggle each bound to `showInChart`.
- The indicator layer skips pane creation (and its series) for indicators
  with `showInChart === false`, while `enabled` keeps driving computation,
  Technicals panel and alarms untouched.
- Semantics of the three flags:
  - `enabled` = master switch: computation, Technicals panel, alarms.
  - `showInChart` = pane drawn in the chart window at all (Settings).
  - `visible` = open pane vs collapsed strip (chart pane header chevron).

## Acceptance Criteria

- [x] New "Chart" tab in Technicals settings lists all 13 sub-pane indicators with toggles, plus Bollinger Bands and Pivots in an Overlays section.
- [x] Switching a toggle off removes that pane from the chart immediately (next render); switching on restores it with its previous collapsed/open state.
- [x] A hidden indicator keeps calculating and stays visible in the Technicals panel and alarms.
- [x] `showInChart` persists across sessions; existing installs migrate to visible (`true`).
- [x] Layer unit tests: hidden pane claims no pane index and shifts no neighbor; hidden Bollinger/Pivot overlays draw nothing.

## Out of Scope

- Hiding other price-pane overlays (EMA, VWAP, …) — only Bollinger and Pivots are covered.
- Reordering panes or per-pane height controls.
- A hide action on the chart pane header itself (Settings is the control).

## Shipped

Squash-merged into `develop` via PR #2659 (manual browser checks for Chart-tab toggles + Technicals-panel separation passed).
