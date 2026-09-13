---
id: BUG-0463
title: Ichimoku lines are zero until their windows are full
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
assignee: claude-code
branch: fix/bug-0463-ichimoku-warmup-zeros
start_date: 2026-09-13
---

# BUG-0463 — Ichimoku lines are zero until their windows are full

## Symptom

`JSIndicators.ichimoku` wrote `0` into the conversion line, the base line and span B for
every candle before their window was full, instead of leaving them without a value. Two
places showed it:

- **The chart.** It draws every finite number. At the start of the loaded history the
  Ichimoku lines dropped to zero, and span A, the mean of conversion and base, stood at
  half the price. With the default 9 / 26 / 52 / 26 on the recorded BTCUSDT 1h fixture:

  | line | candles at 0 | worst wrong value |
  |---|---|---|
  | conversion | 8 | 0 |
  | base | 25 | 0 |
  | span B (displaced) | 51 | 0, at candles 26–76 |
  | span A (displaced) | 8 at 0, then half-built | 31,623 at candle 50, price near 63,000 |

  A trader sees it when the start of the history is in view: the price scale stretches to
  zero and the candles flatten into a line.

- **The Technicals panel.** The JavaScript calculator read the last candle's cloud. With
  fewer than 78 candles, span B there was 0, the cloud's bottom sat at zero, and a rising
  market read **"Buy"** off a cloud that did not exist yet. With 77 rising candles:
  `{ spanB: 0, action: "Buy" }`.

## Evidence

**Demonstrated.** Found probing Ichimoku for FEAT-0446 group 4, which puts it on the alert
path. On the alert path, a zero is a value a condition would compare against, so these
lines have to be null there too.

`src/utils/indicators.ts`: the loop set `conversion[i] = 0`, `base[i] = 0` and
`spanB[i] = 0` in the `else` branch of each window check, although the arrays were already
filled with `NaN`.

## Fix

- `JSIndicators.ichimoku` leaves each line `NaN` until its window is full. Span A, computed
  from the other two, is `NaN` by itself. The chart's `zipToLine` already skips non-finite
  values.
- `technicalsCalculator.ts` reports no Ichimoku until all four lines have a value. Without
  that, the panel would read "Neutral" off a missing span, which is not a reading either.

## Tests

- `src/utils/indicators.test.ts` › *has no line before its window is full, rather than a
  zero*: first value of each line at its window, and no zero in any line. RED before the
  fix (conversion's first value at 0, not 2). The displacement test now compares past both
  windows, where there are values to move.
- `src/utils/technicalsCalculator.test.ts` › *Ichimoku in the panel*: nothing with 77
  rising candles, "Buy" with 78. Before the fix: `spanB: 0, action: "Buy"` at 77. With only
  the indicator fixed: `spanB: NaN, action: "Neutral"`.
