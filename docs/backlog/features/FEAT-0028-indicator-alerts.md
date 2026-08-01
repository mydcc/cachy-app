---
id: FEAT-0028
title: Alerts on indicator conditions
type: feature
status: specced
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0027]
---

# FEAT-0028 — Alerts on indicator conditions

## Problem

Price alerts cover levels. Most setups trigger on an indicator state — a cross,
a threshold, a divergence — which cannot be expressed as a price.

## Proposal

Alert conditions over the existing indicator engines (WASM, WebGPU, JS):
MACD cross and histogram sign change, RSI thresholds, Bollinger band touch and
squeeze, volume anomalies, moving-average crosses (golden/death cross).

Evaluated on **closed candles** by default, with intra-candle evaluation as an
explicit opt-in — an alert that fires on a value that then reverts before the
candle closes is worse than no alert, and this is the single decision that makes
indicator alerts trustworthy or not.

## Acceptance criteria

- [ ] Each condition fires correctly against recorded historical data, tested
      per indicator
- [ ] Closed-candle evaluation is the default and intra-candle is opt-in per
      alert
- [ ] Recalculation on a corrected candle does not double-fire
- [ ] Conditions produce identical results across the WASM, GPU and JS paths —
      or the discrepancy is documented
- [ ] German and English strings

## Links

- [`FEAT-0027`](FEAT-0027-alert-engine.md)
- `src/services/technicalsService.ts`
- [`BUG-0005`](../bugs/BUG-0005-gpu-chop-field-mismatch.md) — cross-path parity matters here
