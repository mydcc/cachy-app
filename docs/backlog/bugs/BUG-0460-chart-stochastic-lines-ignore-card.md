---
id: BUG-0460
title: The chart's Stochastic and Stoch RSI lines ignore their cards' smoothing
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
branch: fix/bug-0460-chart-stochastic-params
start_date: 2026-09-13
---

# BUG-0460 — The chart's Stochastic and Stoch RSI lines ignore their cards' smoothing

## Symptom

The chart draws two oscillators from different numbers than their settings cards name. It
also differs from the Technicals panel, WASM and the alert seed, which all read those cards
the same way.

| pane | the card says | the chart drew |
|---|---|---|
| Stochastic | %K over `kPeriod`, smoothed by `kSmoothing` (3); %D over that | **raw** %K, and %D over raw %K |
| Stoch RSI | stochastic over `length` (14), %K smoothed by `kPeriod` (3) | stochastic over **`kPeriod` (3)**, %K smoothed by a fixed 3 |

With default settings, on the chart test's candles, the last five values:

- Stochastic %K: `36.4 45.5 54.5 70.0 72.7` drawn, for `57.6 51.5 45.5 56.7 65.8`
- Stoch RSI %K: `66.7 41.9 41.9 75.2 100` drawn, for `58.6 41.9 25.5 50.8 75.5`

Stoch RSI is the worse case: a 3-candle lookback swings between 0 and 100 far more often
than the 14-candle one the card sets. Either pane shows only when its card is set to show
in the chart.

## Evidence

**Demonstrated.** Found reading the four call sites of each oscillator for FEAT-0446 group 3:

- **`indicatorLayer.ts` (the chart):** `stoch(…, kPeriod)` without smoothing;
  `stochRsi(src, rsiLength || length, kPeriod, dPeriod, 3)`.
- **`technicalsCalculator.ts` (the panel's JavaScript engine):** smooths %K by
  `kSmoothing`; calls `stochRsi(src, rsiLength, length, dPeriod, kPeriod)`, with the comment
  "length -> Stoch Length, kPeriod -> K Smoothing".
- **`wasmCalculator.ts`:** passes `kSmoothing` to WASM.
- **`indicatorSettingsSeed.ts`:** maps `length` to `stoch_period` and `kPeriod` to `k_period`.

Reproduced in `indicatorLayer.test.ts` (numbers above).

## Cause

The chart's pane switch mapped the cards' fields by name rather than by what the card
means. Stoch RSI's `kPeriod` reads like a lookback, and the Stochastic pane was written
before `kSmoothing` existed or without it.

## Fix

- **Stochastic:** %K is smoothed by the card's `kSmoothing`, and %D is computed over the
  smoothed %K.
- **Stoch RSI:** the chart passes `length` as the stochastic lookback and `kPeriod` as the
  %K smoothing. `rsiLength` no longer falls back to `length`, which is a different
  parameter.
- The pane headers name every parameter: `14 3 3` for Stochastic, `14 14 3 3` for
  Stoch RSI.

## Acceptance criteria

- [x] A test pins the Stochastic %K and %D lines to `sma(stoch, kSmoothing)` and failed
      without the fix (`indicatorLayer.test.ts`, "oscillator lines follow their cards")
- [x] A test pins the Stoch RSI lines to the stochastic over `length` smoothed by `kPeriod`,
      and failed without the fix
- [x] The chart and window suites stay green

## Out of scope

- One mapping from card to parameters, shared by the chart, the Technicals calculator and
  the seed, would close this class for good. Not done here: the three read different
  structures, and FEAT-0446 group 3 pins the seed ↔ alert side with its own tests.

## Links

- `src/lib/chart/indicatorLayer.ts` — `subPaneContent`, `stochastic` and `stochRsi`
- `src/utils/technicalsCalculator.ts` — the mapping this now matches
- [`FEAT-0446`](../features/FEAT-0446-recorded-history-remaining-indicators.md) — group 3
