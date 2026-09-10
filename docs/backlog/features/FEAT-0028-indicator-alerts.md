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

- ~~**Volume anomalies cannot be written at all.**~~ **Closed 2026-09-10** —
  see "Volume is an operand, and it has a unit" below. Note that the fix this
  entry proposed, adding `volume` to `PriceField`, was *not* the one taken:
  every `PriceField` value is denominated in quote currency, which is what makes
  it comparable against a price threshold, so folding volume in would have made
  `volume > 65000` a legal document.
- ~~**Bollinger has no `bandwidth` output**, so squeeze has nothing to
  compare.~~ **Closed 2026-09-10** — see "Bandwidth is a percentage, on the
  scale the panel already prints" below. The registry now declares
  `upper|middle|lower|percent_b|bandwidth`.
- **Divergence needs a new condition shape.** `compare` and `cross` read one
  candle and two respectively; a divergence is a claim about two swings.
  **Proposed 2026-09-10** in [`ADR-0016`](../../adr/0016-a-claim-about-a-window-is-an-operand.md),
  which argues it is not a condition shape at all: a claim about a window is an
  *operand*, and divergence then composes out of `group` + `compare` + a window
  aggregate. Closing gap 2 turned up a second condition with the same
  shortfall — Bollinger's real Squeeze is a rolling minimum — so the ADR covers
  both rather than one.

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

Getting there meant fixing [`BUG-0430`](../bugs/BUG-0430-macd-seeding-mismatch.md):
WASM seeded MACD's EMAs with the first close while the rest of the project seeds
with an SMA, which at short history made the two paths disagree about the *sign*
of the histogram. Worst histogram difference fell from 1.7 to 9.4e-12.

**The WebGPU path is not covered.** It needs a real `navigator.gpu`, which no
Node test environment provides — the same wall BUG-0005 hit, where a structural
check stood in for a numeric one. Covering it needs a browser and belongs in
Playwright. Until then criterion 4 is met for two of the three paths, and this
is the documented discrepancy the criterion allows rather than a silent gap.

### No double-fire on a corrected candle (criterion 3)

The defence turned out to be two layers, and only one of them held.

`RuleEvaluationLoop.advance` already blocks a candle revised **in place**: it
only yields an anchor when a strictly later open time appears, so a correction
carrying the same open time is not an event. That path was safe.

`RuleEvaluationGate` was not. It compared the incoming anchor to the last one
with `===`, which dedupes the ticks inside one candle and nothing else — *any*
anchor that was not exactly the previous one passed. A reconnect clears the
loop's high-water mark (`forgetSeries`), the store refills the series, and
evaluation resumes from candles already decided: every one of them fired again.
Changed to reject any anchor at or before the last decided one, which makes the
class impossible rather than making one path careful. An edit or a disarm calls
`forget`, which is the only legitimate way to decide an anchor twice.

Covered by `ruleEvaluationGate.test.ts` (correction in place, replay after
reconnect, moving on afterwards, retry after a failed evaluation, `forget`) and
end to end against real wasm in `correctedCandle.integration.test.ts` — which
also pins the other half: suppressing the duplicate must not suppress the
*effect*, so the candles after a correction are still decided on the corrected
series. Three of those tests fail if the guard is reverted.

## Volume is an operand, and it has a unit (2026-09-10)

`Operand::Volume` rather than a seventh `PriceField`, which was the choice this
gap actually turned on. `PriceField` names which OHLC value to read and all of
its values are quote currency; volume is size. One extra enum variant there
would have cost nothing and would have made `volume > 65000` — volume against a
price — a document the core accepts and an alert that fires on the crossover of
two unrelated scales.

So operands now carry a `Dimension` (`price`, `percent`, `volume`, `unitless`)
and `Condition::validate` refuses a comparison whose sides disagree. Three
constraints shaped it:

- **`Constant` stays dimensionless.** It is compared against a price, a
  percentage and an RSI in turn; giving it a unit would break all three. So
  `volume > 1000000` remains legal, which is the plain threshold form of the
  anomaly condition.
- **The dimension sits on the *output*, not the indicator.** `bollinger` is both
  at once: `upper`/`middle`/`lower` are prices and `percent_b` is a bare ratio.
  One dimension per indicator would have made that entry a special case.
  So `volume > volume_ma(20)` is legal and `volume > ema(20)` is refused.
- **Nothing is serialised.** `Dimension` has no `Serialize`, so no canonical
  form changed and no stored rule's content hash moved.

Refusals carry `operand_dimension_mismatch` and name both dimensions. Covered by
9 tests in `document.rs`, 3 in `evaluate.rs` and 5 against the real WASM artefact
in `indicatorConditions.integration.test.ts`; 3 of them fail if the check is
reverted.

### Three findings that are not this change's to fix

- **`invalidLookback` had no translation in either locale file.** It shipped
  with FEAT-0390. `RefusalCode`'s own doc comment claims a variant without a
  translation is caught at review time, but the test asserting that walked a
  *hand-maintained* list which had lost the variant too. Both keys are added and
  the list is now shared by both tests, one of which checks every language.
  The list is still hand-maintained — enumerating a plain Rust enum needs a
  macro or a `strum` dependency, and adding one to the crate that computes money
  is a decision worth taking deliberately.
- **`price` against `percent_change` is still accepted.** `Dimension` knows the
  pair is nonsense and the check would refuse it for free, but rules already in
  a trader's `localStorage` validated yesterday, and a saved alert that stops
  loading is worse than the one being prevented. Pinned by
  `a_price_against_a_percentage_stays_accepted_until_its_own_change`; whoever
  changes that test carries the migration.
- **A `cross` with no previous closed candle answers `DoesNotFire`.** Verified
  pre-existing: `Operand::Price` behaves identically. "It did not cross" claims
  knowledge the evaluator does not have, which is the distinction
  `Indeterminate` exists to keep — but it is a question about every operand, not
  about this addition, so the volume operand inherits the existing answer rather
  than inventing a second one.

Still open: the WebGPU leg of criterion 4, criterion 1's recorded market series,
and the last of the three schema gaps — divergence, whose shape is now proposed
in [`ADR-0016`](../../adr/0016-a-claim-about-a-window-is-an-operand.md) and
awaiting a decision before any code is written.

## Bandwidth is a percentage, on the scale the panel already prints (2026-09-10)

`bollinger.bandwidth` is `(upper - lower) / middle * 100`, `Dimension::Percent`.
The scale was the whole decision. TradingView's BBW is the bare ratio, which
would have been the more standard choice and the wrong one here:
`TechnicalsPanel.svelte` already shows this quantity via
`TechnicalsPresenter.calculateBollingerBandWidth` with a `%` beside it, so a
trader reading `2.41%` off their own screen would write `bandwidth < 2.41` — a
condition true on every candle, and a squeeze alert that fires forever. The
schema matches the surface the number is read from.

That makes the scale a contract between two surfaces rather than an internal
detail, so it is asserted as one: `indicatorSeries.test.ts` compares the series
against the panel's own function. Whoever changes either side fails that test by
name.

A zero middle band yields no value rather than zero. Zero is the tightest
squeeze expressible, so `0` on absent data would fire every squeeze alert —
`NaN` becomes `null` becomes indeterminate, as `percent_b` already does.

Covered by 3 unit tests in `indicatorSeries.test.ts`, 2 registry tests in
`indicator.rs`, and 3 against the real WASM artefact in
`indicatorConditions.integration.test.ts` (contracted state, expansion crossing,
and one that the threshold discriminates at all). Four of them fail if the
`* 100` is removed.

### What this does not close

**A `compare` against a constant is not John Bollinger's Squeeze.** His is the
*lowest* bandwidth over a long lookback — a rolling minimum, which is a claim
about a window rather than about a candle, and which the four condition shapes
cannot express any more than divergence can. An absolute threshold is a usable
proxy and is what this ships; the rolling-minimum form belongs with the
divergence discussion, because it needs the same new shape.

**The oracle cannot police the scale.** `itAgrees` recomputes each condition
through `computeIndicatorSeries`, the very path under test, so a scale error
moves both sides together and the comparison stays silent — reverting the
`* 100` leaves the contracted-state comparison passing while every candle
qualifies. That is why the panel comparison and the discriminating-threshold
test exist: the shared-implementation oracle proves indexing, not units.

## Links

- [`FEAT-0303`](FEAT-0303-strategy-rule-schema.md) — the schema this now targets
- [`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md) — the evaluator that runs these
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the Indicators tab this fills
- [`FEAT-0027`](FEAT-0027-alert-engine.md)
- `src/services/technicalsService.ts`
- [`BUG-0005`](../bugs/BUG-0005-gpu-chop-field-mismatch.md) — cross-path parity matters here
