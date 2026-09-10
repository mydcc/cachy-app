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
adr: ADR-0012
depends_on: [FEAT-0027, FEAT-0387, FEAT-0389]
estimate: 5
size: L
target_date: 2027-01-29
start_date: 2026-08-01
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

## Note added while planning the Super-Alert work (2026-09-04)

Two of the questions this item raises are now answered by the rule core that
[`FEAT-0303`](FEAT-0303-strategy-rule-schema.md) shipped, so they are constraints here
rather than open decisions:

- **Closed-candle by default** is the architecture, not a per-alert setting.
  [`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md) evaluates once per close of the
  trigger timeframe. Intra-candle evaluation, if it is still wanted, is a deliberate
  addition on top — not the default this item has to argue for.
- **Indicator identity and parameters** are `IndicatorRef { id, params, output }` in
  `technicals-wasm/src/rule/indicator.rs`. This item does not define a second way to
  name an indicator.

What remains genuinely this item's work: which conditions exist per indicator (MACD
golden/death cross, DEA zero crossing, bullish/bearish divergence, RSI thresholds,
Bollinger touch and squeeze, volume anomalies, MA crosses), their correctness against
recorded history, and cross-path parity between WASM, GPU and JS.

## Links

- [`FEAT-0303`](FEAT-0303-strategy-rule-schema.md) — the schema this now targets
- [`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md) — the evaluator that runs these
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the Indicators tab this fills
- [`FEAT-0027`](FEAT-0027-alert-engine.md)
- `src/services/technicalsService.ts`
- [`BUG-0005`](../bugs/BUG-0005-gpu-chop-field-mismatch.md) — cross-path parity matters here
