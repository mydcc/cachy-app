---
id: FEAT-0446
title: Prove the remaining panel indicators against recorded history
type: feature
status: in-progress
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: C
adr: ADR-0012
depends_on: [FEAT-0438]
size: M
estimate: 5
assignee: claude-code
start_date: 2026-09-13
---

# FEAT-0446 — Prove the remaining panel indicators against recorded history

## Problem

[`FEAT-0438`](FEAT-0438-recorded-history-condition-correctness.md) proves the conditions
[`FEAT-0028`](FEAT-0028-indicator-alerts.md) shipped: RSI, MACD, Bollinger, volume and
moving-average crosses. That is five indicators.

`src/lib/alerts/indicatorCatalogue.ts` offers **23**, and the core registry accepts all
of them. The gap is not latent: every one of the remaining eighteen is reachable from
the Indicators tab today. A trader can arm an ADX alert, a Stochastic alert or an
Ichimoku alert right now, and no test says any of them fires on the right candle.

FEAT-0438's acceptance criteria enumerate the FEAT-0028 conditions, so closing this was
never in its scope — but the eighteen are named in that suite's `SCOPED_OUT` map rather
than filtered away, and this item is what empties it.

## Proposal

Extend `recordedHistoryConditions.test.ts` with one expectation per remaining indicator,
against the same committed fixture, using the same two-layer design: an independent
oracle pins the flip indices, and the evaluator must match the same literals.

Two of the eighteen need more than a threshold and are the reason this is sized M rather
than S:

- **Parabolic SAR** flips side rather than crossing a level. "SAR is below the price"
  is a `compare`, but the event a trader means is the flip, and whether that is a
  `cross` against `price.close` needs deciding before it is asserted.
- **Ichimoku** has five lines and a forward displacement. Which line the condition reads
  and how the displacement lands relative to the evaluated candle is a contract with
  the chart, not a free choice — the same class of decision `bandwidth`'s scale was.

The other sixteen are thresholds or crosses in the shape already covered.

## Acceptance criteria

- [ ] Every id in `indicatorCatalogue.ts` has at least one recorded-history expectation
      — 9 of 23; the other 14 cannot fire at all today, see "Found: 14 indicators are not
      on the alert path"
- [ ] `SCOPED_OUT` in `recordedHistoryConditions.test.ts` is empty, and the test that
      rejects a stale entry keeps it that way — 14 entries left, each now stating the real
      reason
- [ ] Parabolic SAR's condition shape is decided and documented before it is asserted
- [ ] Ichimoku's displacement handling is asserted against the chart's own values, not
      only against the evaluator
- [x] Each indicator is asserted only after `needs × 3` candles, with its entry added to
      `INDICATOR_WARMUP` — which also requires a `WASM_LOCATION` entry in
      `crossPathParity.test.ts`, so parity coverage grows with it (done for every
      indicator asserted so far: EMA(20), WMA(20), VWMA(20), HMA(20))

## Out of scope

- A second fixture. The committed 1000-candle series is the one this asserts against;
  if an indicator needs a market shape it does not contain, that is a finding to record
  rather than a reason to capture more data inside this item.
- WebGPU parity — [`FEAT-0439`](FEAT-0439-webgpu-cross-path-parity.md) owns that.

## Decided: runtime

One suite, no tag, and no recomputation per candle. The walk used to recompute every
indicator over the first `i + 1` candles at each candle `i`, which is quadratic; with
sixteen conditions the MACD walk ran past vitest's 20-second per-test timeout under
parallel load. Each series is now computed once over the fixture and sliced per candle.

That is only the same thing if `computeIndicatorSeries` is causal, so it is asserted, not
assumed: a test cuts every series the expectations read at every 41st candle and at the
last one, recomputes over the prefix, and requires exact string equality with the slice.
Prime spacing keeps a sample from lining up with a period and hiding behind it.

Measured on the same machine: the suite alone went from 92.7 s to 64.8 s; the alert,
rules and indicator suites together from 143 s with a timeout to 69.6 s green.

## Found: 14 indicators are not on the alert path

This item was written assuming all eighteen could fire and only lacked proof. Probing
warmup lengths showed otherwise. `computeIndicatorSeries` supports nine ids — `rsi`,
`macd`, `bollinger`, `ema`, `sma`, `wma`, `vwma`, `hma`, `volume_ma` — and returns
`unsupported` for every other one:

`stochastic`, `stoch_rsi`, `williams_r`, `cci`, `adx`, `ao`, `momentum`, `atr`,
`choppiness`, `super_trend`, `mfi`, `obv`, `parabolic_sar`, `ichimoku`

The Indicators tab and the combo builder still offer all of them. A trader can arm one;
`RuleEvaluationLoop` then reports it as unevaluable on the first close ("Alerts that can
never fire", notify by default). So these are not unproven alerts, they are inert ones,
and there is no firing to assert an index for.

`JSIndicators` already has an implementation of every one of them. Wiring them in is
therefore feasible, but it is a behaviour change on a money path — an alert that was
inert starts firing — and each needs its own parity check against the chart, because
`BUG-0430` and `BUG-0450` show these paths do diverge. That is a product decision, not a
side effect of a test item.

The suite enforces the ordering either way: "scopes out only indicators the alert path
genuinely cannot compute" fails the moment one of the fourteen becomes computable, so
its recorded-history expectation has to land in the same change that makes it fire.

## Progress (2026-09-13)

- EMA(20), WMA(20), VWMA(20) and HMA(20) — computable and offered, but previously
  unproven — have recorded-history expectations, warmup entries and parity locations
- Two defects surfaced on the way, each fixed in its own PR:
  [`BUG-0449`](../bugs/BUG-0449-hma-alert-throws-and-silences-series.md) (an HMA alert
  threw on every close and silenced every rule after it on the series) and
  [`BUG-0450`](../bugs/BUG-0450-wma-sliding-sum-drift.md) (the JavaScript WMA drifted with
  series length, which failed HMA parity)
- `SCOPED_OUT` reasons rewritten from "no condition shipped" to what is true

## Links

- [`FEAT-0438`](FEAT-0438-recorded-history-condition-correctness.md) — the suite and the fixture this extends
- [`FEAT-0028`](FEAT-0028-indicator-alerts.md) — the conditions that were shipped
- `src/lib/alerts/indicatorCatalogue.ts` — the 23 the panel offers
- `src/services/alertEngine/indicatorWarmup.ts` — the shared warmup table
- `src/lib/rules/indicatorSeries.ts` — `SUPPORTED`, the nine ids the alert path computes
