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
series actually in the chart: normalized symbol, timeframe, last rendered open
time, input-batch length, the source kline array, and the indicator-settings
snapshot. The fast path may only fire when that record matches the incoming
klines on **all** fields. Arm it right after `setData()` succeeds and clear it
when `setData` fails or a live update throws, so a failed render cannot leave a
half-valid identity.

The record is a plain variable, not `$state`: it is read and written by the same
effect, and a reactive object literal would make the effect a subscriber of its
own output. A batch whose tail is filtered out (a malformed WS kline) can never
match the guard, and with `$state` that re-arms the effect until Svelte throws
`effect_update_depth_exceeded` (proven by a regression test).

Additional hardening from review:

- the source array reference is part of the identity, so a REST refetch that
  rebuilds the array with corrected candles forces a full render even when the
  last open time and length are unchanged;
- a pending throttled tick is dropped when a full render starts, so it cannot
  `update()` a newly switched series with the old interval's klines;
- an indicator-layer failure no longer disarms the fast path — the series is
  already correct, so live ticks keep flowing and the next new candle retries
  the indicator render.

Regression tests in `CandleChartView.component.test.ts`:

- interval switch with identical last open time and equal length re-renders
  (`setData`, not only `update`) — fails without the fix;
- market switch under the same collision re-renders — fails without the fix;
- a genuine in-place tick after the switch still uses the fast path;
- an indicator-settings change forces a full render (fails if the settings leg
  is removed);
- a filtered batch tail does not loop the effect (throws
  `effect_update_depth_exceeded` with a reactive record);
- a failed live update disarms the record and the next flush re-renders;
- an indicator-layer failure keeps the fast path armed (the mock throws for
  real, unlike the previous vacuous test).

## Acceptance criteria

- [x] A test reproduces the interval-switch defect and fails without the fix
- [x] A test reproduces the market-switch variant and fails without the fix
- [x] The fix makes both tests pass
- [x] A real in-place tick on the newly rendered interval still takes the fast path (no full re-render per tick)
- [x] An indicator-settings change forces a full render (test fails without that guard leg)
- [x] A filtered batch tail cannot loop the effect (`$state` variant throws `effect_update_depth_exceeded`)
- [x] A failed live update disarms the record and the next flush re-renders
- [x] An indicator-layer failure keeps the fast path armed
- [x] `src/lib/windows/implementations/CandleChartView.component.test.ts` passes in full (56 tests)

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
