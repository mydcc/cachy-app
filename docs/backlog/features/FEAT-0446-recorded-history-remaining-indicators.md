---
id: FEAT-0446
title: Prove the remaining panel indicators against recorded history
type: feature
status: specced
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: C
adr: ADR-0012
depends_on: [FEAT-0438]
size: M
estimate: 5
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
- [ ] `SCOPED_OUT` in `recordedHistoryConditions.test.ts` is empty, and the test that
      rejects a stale entry keeps it that way
- [ ] Parabolic SAR's condition shape is decided and documented before it is asserted
- [ ] Ichimoku's displacement handling is asserted against the chart's own values, not
      only against the evaluator
- [ ] Each indicator is asserted only after `needs × 3` candles, with its entry added to
      `INDICATOR_WARMUP` — which also requires a `WASM_LOCATION` entry in
      `crossPathParity.test.ts`, so parity coverage grows with it

## Out of scope

- A second fixture. The committed 1000-candle series is the one this asserts against;
  if an indicator needs a market shape it does not contain, that is a finding to record
  rather than a reason to capture more data inside this item.
- WebGPU parity — [`FEAT-0439`](FEAT-0439-webgpu-cross-path-parity.md) owns that.

## Open questions

- Runtime. FEAT-0438's twelve conditions take roughly 70 seconds, and the walk is
  quadratic in series length. Eighteen more roughly triples that. Whether this stays one
  suite, moves behind a tag, or shares one walk across conditions reading the same
  indicator is a decision this item has to take rather than discover in CI.

## Links

- [`FEAT-0438`](FEAT-0438-recorded-history-condition-correctness.md) — the suite and the fixture this extends
- [`FEAT-0028`](FEAT-0028-indicator-alerts.md) — the conditions that were shipped
- `src/lib/alerts/indicatorCatalogue.ts` — the 23 the panel offers
- `src/services/alertEngine/indicatorWarmup.ts` — the shared warmup table
