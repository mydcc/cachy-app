---
id: BUG-0457
title: Chart pane headers recompute sourced indicators over the close on every live tick
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: chart
data_class: none
adr: none
depends_on: []
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

**Read from the code, not yet reproduced in a test.** In `src/lib/chart/indicatorLayer.ts`:

- the full render: `getSourceData(rows, this.src(s.cci.source))`, and the same for RSI,
  MACD, Stoch RSI and Momentum
- `updateHeaderValues`: `JSIndicators.cci(a.closes, …)`, `JSIndicators.rsi(a.closes, …)`,
  and the same for the others

Found while wiring CCI into the alert path (FEAT-0446 group 2), which computes CCI over
the typical price.

## Fix direction

Read each sourced indicator's header value over `getSourceData(rows, this.src(s.<card>.source))`,
exactly as the full render does — ideally through one helper both paths call, so the two
cannot drift again.

## Acceptance criteria

- [ ] A test sets the CCI card to its default `hlc3`, sends a live tick, and fails today
      because the header value is CCI of the close
- [ ] Every sourced indicator's header value after a tick equals the last value of its
      drawn line
- [ ] The full render and the tick update read the source through the same code

## Links

- `src/lib/chart/indicatorLayer.ts` — `updateHeaderValues`, the sub-pane render
- [`BUG-0453`](BUG-0453-card-alert-ignores-price-source.md) — the same source question on the alert side
- [`FEAT-0446`](../features/FEAT-0446-recorded-history-remaining-indicators.md) — where it was found
