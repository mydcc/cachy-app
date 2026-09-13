---
id: BUG-0457
title: Chart pane headers recompute sourced indicators over the close on every live tick
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: chart
data_class: none
adr: none
depends_on: []
assignee: claude-code
branch: fix/bug-0457-chart-header-source
start_date: 2026-09-13
---

# BUG-0457 — Chart pane headers recompute sourced indicators over the close on every live tick

## Symptom

A chart sub-pane shows its indicator's current value in the pane header. After a full
render that value is computed over the card's **source**. On every live tick
`IndicatorLayer.updateHeaderValues` recomputes it — over the **close**, whatever the source
is set to. The line stays on its source; the number next to it switches to another one.

Affected, from `updateHeaderValues`: RSI, MACD, Stoch RSI, CCI and Momentum. CCI is the
worst case: its card **defaults** to `hlc3`, so with default settings the CCI header shows
CCI of the close from the first tick on, next to a line of CCI of the typical price.

The method's own comment names why this matters: a stale header is "dangerous for a
trading readout", and a header computed over the wrong price is worse than a stale one.

## Evidence

**Demonstrated.** Reproduced in `indicatorLayer.test.ts` on candles whose range varies bar
to bar: after one tick, the five sourced headers read CCI `-143.79` where the hlc3 line ends at
`288.83`, RSI `43.82` for `62.89`, and so on. (With a constant range the typical price is the
close shifted by a constant, and all five oscillators are shift-invariant, so a test on such
candles cannot fail.) Originally read from the code, in `src/lib/chart/indicatorLayer.ts`:

- the full render: `getSourceData(rows, this.src(s.cci.source))`, and the same for RSI,
  MACD, Stoch RSI and Momentum
- `updateHeaderValues`: `JSIndicators.cci(a.closes, …)`, `JSIndicators.rsi(a.closes, …)`,
  and the same for the others

Found while wiring CCI into the alert path (FEAT-0446 group 2), which computes CCI over
the typical price.

## Cause

`renderSubPanes` and `updateHeaderValues` each carried their own switch over the sub-panes.
The tick copy passed `a.closes` where the render passed the card's source.

The same drift had a second symptom: the render reported **no** OBV header value, the tick
copy did, so the OBV header was blank until the first tick and filled after it.

## Fix

- One method, `subPaneContent(key, rows, columns)`, computes a sub-pane's settings label
  and lines. `renderSubPanes` draws those lines and records the last value of the first as
  the header; `updateHeaderValues` records the same value from the same call. The two paths
  no longer hold a copy of the indicator computation to drift apart.
- `renderSubPanes` walks `SUB_PANES` in order instead of thirteen hand-written blocks; the
  claiming order is unchanged.
- `SUB_PANES` keys are a closed union (`SubPaneKey`), so the switch is checked for
  exhaustiveness and `IndicatorPaneInfo.key` names only real panes.
- OBV now shows its header value after a full render too, which is what a live chart already
  showed after its first tick.

## Acceptance criteria

- [x] A test sets the CCI card to its default `hlc3`, sends a live tick, and failed before
      the fix because the header value was CCI of the close
- [x] Every sub-pane's header value after a tick equals the header a full render of the same
      candles reports, and that is the last value of the pane's first drawn line
- [x] The full render and the tick update read the source through the same code

## Links

- `src/lib/chart/indicatorLayer.ts` — `updateHeaderValues`, the sub-pane render
- [`BUG-0453`](BUG-0453-card-alert-ignores-price-source.md) — the same source question on the alert side
- [`FEAT-0446`](../features/FEAT-0446-recorded-history-remaining-indicators.md) — where it was found
