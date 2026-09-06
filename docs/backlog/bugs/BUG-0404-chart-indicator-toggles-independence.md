---
id: BUG-0404
title: Chart indicator toggles incomplete and coupled to Technicals switches
type: bug
status: in-progress
assignee: opencode
branch: fix/bug-0404-chart-indicator-toggles
priority: P1
milestone: M3
editions: [community, pro, private]
area: chart
data_class: none
adr: none
depends_on: [FEAT-0403]
estimate: 3
size: M
target_date: 2026-09-19
start_date: 2026-09-05
---

# BUG-0404 — Chart indicator toggles incomplete and coupled to Technicals switches

## Problem

1. **Incomplete Chart tab.** The Settings Chart tab lists the 13 sub-pane
   indicators plus Bollinger Bands and Pivots, but ten indicators that draw
   in the chart have no toggle and cannot be hidden without disabling them
   for the Technicals panel as well: EMA, SMA, WMA, HMA, VWMA, VWAP,
   Ichimoku, SuperTrend, Parabolic SAR, ATR Trailing Stop.
2. **Double disable.** Chart display is gated by
   `enabled AND showInChart` (`isPaneActive` in `indicatorLayer.ts`). An
   indicator disabled for the Technicals panel (`enabled: false`) but
   enabled for the chart (`showInChart: true`) draws nothing — the two
   switches are not independent as FEAT-0403 intended.
3. **Wrong default.** All `showInChart` flags default to shown. Chart
   display must be opt-in: on first use every chart toggle starts off and
   the user enables what they want to see.

## Fix

- Gate chart drawing (sub-panes, pane budget, overlays) on `showInChart`
  alone; `enabled` keeps driving only the Technicals panel and alarms.
- Add `showInChart` to the ten overlay entries above, with toggles in the
  Chart tab, grouped by the existing indicator categories (Oscillators,
  Trend, Volatility, Volume) in a two-column grid.
- Default every `showInChart` to `false`. Existing installs keep their
  persisted values for the 13 sub-pane indicators; everything missing the
  key migrates to hidden.
- `atr`, `volumeProfile` and `volumeMa` draw nothing in the chart and get
  no toggle. The persisted-but-unread `visible` flag on overlay-only
  indicators stays as-is (uniformity, accepted).

## Acceptance Criteria

- [ ] All 25 chart-drawing indicators (13 sub-panes + 12 overlays) have a Chart-tab toggle; `atr`, `volumeProfile`, `volumeMa` intentionally have none.
- [ ] An indicator with `enabled: false` + `showInChart: true` draws in the chart and stays out of the Technicals panel.
- [ ] An indicator with `showInChart: false` draws nothing in the chart regardless of `enabled`.
- [ ] Fresh installs show no indicator lines or panes in the chart until enabled in Settings; existing installs keep their sub-pane choices.
- [ ] Chart tab groups toggles by category (Oscillators, Trend, Volatility, Volume) in two columns.
- [ ] Layer unit tests prove the decoupled gates; i18n DE/EN complete with no dead keys.

## Out of Scope

- Toggles for `atr`, `volumeProfile`, `volumeMa` (not drawn in the chart).
- Removing the unused `visible` flag from overlay-only indicators.
- Per-indicator line width or colors (see configurable `lineWidth`).
