---
id: BUG-0709
title: Chart window keeps the previous interval's candles when the timeframe changes
type: bug
status: done
branch: fix/chart-timeframe-stale-series
priority: P2
milestone: none
created: "2026-10-21"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
estimate: 2
size: S
assignee: opencode
---

# BUG-0709 — Chart window keeps the previous interval's candles when the timeframe changes

## Symptom

The timeframe buttons in a chart window's title bar (5m, 15m, 1h, 4h) move
their active highlight, but the candles on the chart stay on the previous
interval. The window fetches the new interval's klines correctly, so the series
is stale, not the data. Because the header shows the newly clicked interval
while the chart still paints the old one, the trader cannot tell which interval
is actually displayed.

It is intermittent rather than permanent: switching to an interval whose
current candle opens at a different instant works, which is why the buttons
appear to "barely react".

## Evidence

**Demonstrated** — reproduced in the dev app on 2026-10-21 (BTCUSDT, ~12:20 UTC)
with the component's render branch instrumented:

- Last candle open times: `5m = 1792585200`, `15m = 1792584900`,
  `1h = 1792584000`, `4h = 1792584000`.
- `1h → 4h`: the data effect evaluated with `isLiveUpdate: true`,
  `lastRenderedTime === lastTime === 1792584000`, both counts `2000` → only
  `candleSeries.update()` ran for the last candle; `setData()` was skipped.
- `4h → 5m` and `15m → 1h`: `isLiveUpdate: false` (different open times) →
  the full series was re-rendered.
- The network log shows `/api/klines?…&interval=5m|15m|4h` for each click, and
  `marketState.data.BTCUSDT.klines` held real per-interval series (5-minute
  spacing for 5m, 4-hour spacing for 4h). The buttons and the data layer are
  not the defect.

Reproduction: open a chart window, let two intervals' histories reach the same
length, then switch between them at a moment when their forming candles share
an open time (all four do at the top of a 4h bucket; 5m/15m collide at every
15-minute boundary). The header moves, the candles do not.

## Cause

`src/lib/windows/implementations/CandleChartView.svelte`, the kline data
`$effect`: the live-tick fast path was armed on

```ts
lastRenderedSettingsJson === currentIndicatorSettingsJson &&
lastRenderedTime === lastTime &&
klines.length === lastRenderedCount
```

The interval and the market were not part of that identity. A timeframe switch
whose new series starts on the same candle open time and has the same length is
indistinguishable from a tick on the rendered series, so the component took the
fast path: `candleSeries.update()` for one candle instead of
`candleSeries.setData()` for the whole series. The remaining candles stay on the
old interval.

`ChartWindow.updateHeaderControls()` and `componentProps` are correct — they do
change the interval and trigger the data fetch. The stale render is the whole
defect.

## Fix

Replace the three parallel bookkeeping fields with one record describing the
series actually in the chart (normalized symbol, timeframe, last open time,
length, indicator-settings snapshot). The fast path may only fire when that
record matches the incoming klines on **all** fields. Arm it right after
`setData()` succeeds and clear it in both error paths, so a failed render cannot
leave a half-valid identity.

Regression tests in `CandleChartView.component.test.ts`:

- interval switch with identical last open time and equal length re-renders
  (`setData`, not only `update`) — fails without the fix;
- market switch under the same collision re-renders — fails without the fix;
- a genuine in-place tick after the switch still uses the fast path.

## Acceptance criteria

- [x] A test reproduces the interval-switch defect and fails without the fix
- [x] A test reproduces the market-switch variant and fails without the fix
- [x] The fix makes both tests pass
- [x] A real in-place tick on the newly rendered interval still takes the fast path (no full re-render per tick)
- [x] `src/lib/windows/implementations/CandleChartView.component.test.ts` passes in full (53 tests)

## Out of scope

- Raising the window when a header control is clicked (the control's
  `pointerdown` stops propagation, so `bringToFront` never runs).
- Persisting a chart window's timeframe in the session (`saveSession()` is only
  triggered by opening/closing a window).
- Adding an in-chart interval label; the active header button remains the only
  indicator, which is truthful once the series follows it.

## Links

- `src/lib/windows/implementations/CandleChartView.svelte`
- `src/lib/windows/implementations/ChartWindow.svelte.ts`
- `src/components/shared/windows/WindowFrame.svelte`
- Branch: `fix/chart-timeframe-stale-series`
