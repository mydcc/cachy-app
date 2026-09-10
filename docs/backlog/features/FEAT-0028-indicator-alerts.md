---
id: FEAT-0028
title: Alerts on indicator conditions
type: feature
status: in-progress
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0027, FEAT-0387, FEAT-0389]
estimate: 5
size: L
assignee: claude-code
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

## Found while wiring the evaluator (2026-09-10)

Three gaps that this item has to close, discovered by making indicator
conditions actually evaluate rather than resolve to "no value":

- **Volume anomalies cannot be written at all.** `PriceField` is
  `open|high|low|close|hl2|hlc3` (`technicals-wasm/src/rule/condition.rs`), so
  raw volume has no operand. `volume_ma` with `period: 1` looked like a
  workaround and is not one: the core constrains `period` to `2..=5000` and
  refuses it. So the condition is unavailable rather than awkward. Adding
  `volume` to `PriceField` is the fix, and it is a core schema change. Pinned by
  a test in `indicatorConditions.integration.test.ts`, which fails once the
  operand exists.
- **Bollinger has no `bandwidth` output**, so squeeze has nothing to compare.
  The registry declares `upper|middle|lower|percent_b`.
- **Divergence needs a new condition shape.** `compare` and `cross` read one
  candle and two respectively; a divergence is a claim about two swings. It is
  the only condition in this item that the existing four shapes cannot express.

## Progress (2026-09-10)

Indicator conditions evaluate for the first time — the loop computes and sends
the series the evaluator reads, which it previously did not, so every indicator
condition resolved to indeterminate.

Tested per indicator over a 400-candle series, each condition answered twice by
paths sharing no code: RSI thresholds and cross, MACD line/signal cross and
histogram sign change, Bollinger touch and `percent_b`, EMA golden cross, volume
average comparison. Indicator maths separately checked against independent
textbook implementations.

**Acceptance criterion 1 is not yet ticked**, for one reason worth stating: the
series is a committed, seeded pseudo-random walk, not recorded market data. It
is deterministic and not cherry-picked, and it catches what actually breaks in
condition code — indexing, warmup, cross direction. It cannot catch a condition
that only misbehaves on a shape real markets produce and the generator does not:
a halt, a gap, a wick to zero, a depeg. Recording a real series and re-running
the same oracles against it is the remaining work for that criterion.

### Cross-path parity (criterion 4)

WASM and JS now agree on SMA, EMA, RSI, Bollinger, volume MA and all three MACD
outputs to within `f64` noise, asserted by
`src/services/alertEngine/crossPathParity.test.ts` at three different history
lengths against the real committed WASM artefact.

Getting there meant fixing [`BUG-0429`](../bugs/BUG-0429-macd-seeding-mismatch.md):
WASM seeded MACD's EMAs with the first close while the rest of the project seeds
with an SMA, which at short history made the two paths disagree about the *sign*
of the histogram. Worst histogram difference fell from 1.7 to 9.4e-12.

**The WebGPU path is not covered.** It needs a real `navigator.gpu`, which no
Node test environment provides — the same wall BUG-0005 hit, where a structural
check stood in for a numeric one. Covering it needs a browser and belongs in
Playwright. Until then criterion 4 is met for two of the three paths, and this
is the documented discrepancy the criterion allows rather than a silent gap.

Still open: the WebGPU leg of criterion 4, no-double-fire on a corrected candle
(criterion 3), and the three schema gaps above.

## Links

- [`FEAT-0303`](FEAT-0303-strategy-rule-schema.md) — the schema this now targets
- [`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md) — the evaluator that runs these
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the Indicators tab this fills
- [`FEAT-0027`](FEAT-0027-alert-engine.md)
- `src/services/technicalsService.ts`
- [`BUG-0005`](../bugs/BUG-0005-gpu-chop-field-mismatch.md) — cross-path parity matters here
