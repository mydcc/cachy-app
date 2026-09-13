---
id: FEAT-0446
title: Prove the remaining panel indicators against recorded history
type: feature
status: done
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

- [x] Every id in `REGISTRY_CATALOGUE` has at least one recorded-history expectation —
      23 of 23 since group 4 (since BUG-0451 the panel's `INDICATOR_CATALOGUE` was only
      the computable subset, which is now all of them)
- [x] `SCOPED_OUT` in `recordedHistoryConditions.test.ts` names only the ids the alert
      path genuinely cannot compute — none today — and the test that rejects a stale
      entry keeps it that way
- [x] OBV's condition shape is decided and documented before it is wired in (see "Found:
      OBV depends on the loaded window" and "Decided: group 4")
- [x] Parabolic SAR's condition shape is decided and documented before it is asserted
      (see "Decided: group 4")
- [x] Ichimoku's displacement handling is asserted against the chart's own values, not
      only against the evaluator (`indicatorLayer.test.ts`, "the Ichimoku lines an alert
      reads are the lines drawn")
- [x] Each indicator is asserted only after `needs × 3` candles, with its entry added to
      `INDICATOR_WARMUP` — which also requires a `WASM_LOCATION` entry in
      `crossPathParity.test.ts`, so parity coverage grows with it (done for every
      indicator asserted so far: EMA(20), WMA(20), VWMA(20), HMA(20), and every indicator
      wired in by groups 1–3)

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

**Group 4: only the last 128 candles cross into the core.** The context still carried
every candle before the evaluated one, as JSON, on every evaluation. With 30 conditions
the suite took 169 s on its own and two walks timed out under parallel load. Handing the
core the last 128 candles took it to 53 s. That is only the same thing if no verdict
reads further back, so it is asserted: at every 41st candle and the last one, each
expectation's verdict from the tail must equal its verdict from the whole history. With
a tail of 30 it fails on the 60-candle squeeze.

## Found: 14 indicators are not on the alert path

This item was written assuming all eighteen could fire and only lacked proof. Probing
warmup lengths showed otherwise. `computeIndicatorSeries` supports nine ids — `rsi`,
`macd`, `bollinger`, `ema`, `sma`, `wma`, `vwma`, `hma`, `volume_ma` — and returns
`unsupported` for every other one:

`stochastic`, `stoch_rsi`, `williams_r`, `cci`, `adx`, `ao`, `momentum`, `atr`,
`choppiness`, `super_trend`, `mfi`, `obv`, `parabolic_sar`, `ichimoku`

The Indicators tab, the combo builder and the settings cards' create-alert action offered
all of them. A trader could arm one; `RuleEvaluationLoop` then reported it as unevaluable
on the first close ("Alerts that can never fire", notify by default). So these were not
unproven alerts, they were inert ones, and there is no firing to assert an index for.

`JSIndicators` already has an implementation of every one of them. Wiring them in is
therefore feasible, but it is a behaviour change on a money path — an alert that was
inert starts firing — and each needs its own parity check against the chart, because
`BUG-0430` and `BUG-0450` show these paths do diverge. That was put to the product owner
rather than taken as a side effect of a test item.

## Decided: hide now, wire in groups (2026-09-13)

**Now:** [`BUG-0451`](../bugs/BUG-0451-panel-offers-indicators-that-cannot-fire.md) stops
offering the fourteen. `ALERT_PATH_INDICATORS` is the one list both the series computation
and the panel catalogue read, so an indicator reappears in the panel in exactly the change
that makes it compute.

**Then:** wire them in, one group per PR. Each PR adds the ids to `ALERT_PATH_INDICATORS`,
implements them in `computeIndicatorSeries` from the existing `JSIndicators`, and carries
in the same diff: a `WASM_LOCATION` parity entry, an `INDICATOR_WARMUP` entry, a
recorded-history expectation, and the removal from `SCOPED_OUT` and from the pinned hidden
list in `indicatorCatalogue.test.ts`. Three guards already fail if any of those is missing.

| Group | Indicators | Why together |
|---|---|---|
| 1 — single line from close | `momentum` | no high/low column yet on the alert path; smallest step. **Wired (2026-09-13).** OBV was planned here and moved to group 4 |
| 2 — single line from high, low, close | `williams_r`, `cci`, `atr`, `choppiness`, `mfi`, `ao` | adds the high/low columns once. **Wired (2026-09-13).** CCI over the typical price, see "Decided: group 2" |
| 3 — several output lines | `stochastic`, `stoch_rsi`, `adx`, `super_trend` | output-line mapping, like MACD and Bollinger. **Wired (2026-09-13).** See "Decided: group 3" |
| 4 — shape decisions first | `parabolic_sar`, `ichimoku`, `obv` | SAR flips side; Ichimoku displaces forward; OBV's level depends on the loaded window — each needs its condition shape decided and written down before it is asserted. **Decided (2026-09-13)**, see "Decided: group 4"; one PR each. **Ichimoku and Parabolic SAR wired** |

The suite enforces the ordering either way: "scopes out only indicators the alert path
genuinely cannot compute" fails the moment one of the fourteen becomes computable, so
its recorded-history expectation has to land in the same change that makes it fire.

## Found: OBV depends on the loaded window

`JSIndicators.obv` accumulates from the first candle it is handed, starting at zero. That
is how OBV is defined, and the chart does the same — but on the alert path the first
candle is not a fixed point in the market. `readClosedCandles` reads `marketState`'s
kline history, which is a rolling buffer: `settingsState.chartHistoryLimit` candles
(2000 by default), trimmed from the front as candles close, and extended up to 50,000
when the chart loads further back.

So OBV's *level* at a given candle changes whenever the buffer's start moves: every close
once the buffer is full, and whenever the trader scrolls back. Cutting `k` candles off
the front shifts the whole series by a constant. That makes the conditions split cleanly:

| Condition on OBV | Survives a shifted start? |
|---|---|
| against a fixed number (`obv > 1,000,000`, crossing a level) | **no** — fires or stays quiet on how much history is loaded |
| against a moving average of itself, or its change over `n` candles | yes — the constant cancels |
| against another volume line (`volume_ma`, the candle's volume) | no, and not meaningful: cumulative against per-candle |

Wiring OBV in as-is would put the first row in the panel on a money path. It stays
hidden until the shape is decided: restrict it to self-relative conditions, or give it a
fixed anchor. The recorded-history suite cannot catch this — its fixture always starts
at candle 0 — so `indicatorSeries.test.ts` pins the property the wired indicators do
have instead ("gives momentum the same value at a candle however much history precedes
it").

## Decided: group 2 (2026-09-13)

**CCI is computed over the typical price.** CCI is defined over `(high + low + close) / 3`,
the WASM core computes it so, and the CCI card defaults to `hlc3`. The first plan read it
over the close, which would have matched none of the three. `alertPathSourceOf` in
`alertPathIndicators.ts` now names each indicator's price — close for all but CCI — and is
read by both `computeIndicatorSeries` and the settings seed, so the card rule from
BUG-0453 compares a card's source with *that indicator's* price. A CCI card on `hlc3` is
armable; on `close` it refuses and names `hlc3`. The availability value became
`source-mismatch` and the string `settings.technicals.alertSourceMismatch` with a
`{source}` placeholder.

**A window with no range has no value on the alert path.** Williams %R, choppiness and CCI
divide by a range, and MFI by its total money flow. Over a flat window the chart draws 0 (and
50 for MFI) and WASM −50 for %R. None of those is a reading, and "%R above −20" would fire
on a halted market. The series is null there, which the core reads as indeterminate — the
Bollinger bandwidth decision again. The condition is decided from the inputs (the window's
highest and lowest, whether any money flowed), not from the running sums. MFI at 100 when
money only flowed in is a real reading and is kept, and so is a zero ATR.

**AO is checked against `Decimal`, not WASM.** The WASM calculator has no awesome
oscillator. `crossPathParity.test.ts` names it in `NOT_IN_WASM` rather than skipping it,
and `indicatorSeries.test.ts` compares it with the fast minus the slow `Decimal` average of
the median price over the recorded fixture, within 1e-9. Its chart function writes 0 before
the slow average is full; the series makes that null.

**Recursion is not window-free, and that is accepted.** Williams %R and CCI recompute each
window and agree exactly however much history precedes a candle; choppiness, MFI and AO
slide sums and agree to rounding (both pinned). ATR is Wilder-smoothed, so like RSI and EMA
already on the path it forgets its start geometrically rather than not at all: below 1e-9
after roughly 360 candles, against a 2000-candle default buffer.

## Decided: group 3 (2026-09-13)

**Each engine was measured before it was trusted, and three defects were fixed first.**
Probing JavaScript ↔ WASM parity found:
- [`BUG-0458`](../bugs/BUG-0458-js-supertrend-never-has-a-value.md): the JavaScript SuperTrend
  never had a value.
- [`BUG-0459`](../bugs/BUG-0459-adx-seeds-off-wilder.md): both ADX engines seeded Wilder's
  averages off the definition, WASM by 11.8 points at 40 candles.
- [`BUG-0460`](../bugs/BUG-0460-chart-stochastic-lines-ignore-card.md): the chart drew
  Stochastic and Stoch RSI from other parameters than their cards.

This group depends on all three.

**The lines are the core's outputs, computed by the chart's and panel's functions.**
- `stochastic`: `k` is `sma(stoch(k_period), k_smoothing)`, and `d` is its `d_period`
  average.
- `stoch_rsi`: `k` and `d` come from `JSIndicators.stochRsi(close, rsi_period, stoch_period,
  d_period, k_period)`.
- `adx`: `adx`, `plus_di` and `minus_di` come from `calculateADXSeries` with one period for
  both smoothings.
- `super_trend`: `value` is the band the trend stands on, with `upper` and `lower` beside it.
  A close crossing `value` is the flip.

**A stochastic over a window with no range has no value, and neither does an average reaching
over one.** This is the group 2 rule for %R. The chart's 50 is not a reading, and "%K above
50" would fire on a halted market. The raw line is computed with the 50 and nulled
afterwards, because a NaN inside a sliding sum would stay in it. For Stoch RSI the range is
the RSI's. A zero ADX and zero DIs on a market with no movement are kept: "no trend, no
direction" is a true reading, as a zero ATR is, and WASM reports the same zeros.

**An ADX card whose DI length and smoothing differ refuses to arm.** The core's `adx` has
one period, carried from the smoothing. The chart draws the pane over the DI length, and
WASM draws the panel over the smoothing. Where they differ, no alert computes the line on
screen. `cardAlertAvailability` answers `length-mismatch` (through `ONE_LENGTH_CARDS`), and
the button names both settings (`settings.technicals.alertAdxLengthMismatch`). The default
card has 14 and 14 and arms.

**Parity.**
- Stochastic, ADX and both SuperTrend bands are in `WASM_LOCATION` at 1e-9.
- The SuperTrend line is compared as the band WASM's trend names, on both trends.
- Stoch RSI has no WASM implementation. It is named in `NOT_IN_WASM` and checked against a
  `Decimal` stochastic of Wilder's RSI.
- ADX joins the seed-gap shape guard.

**Start-dependence, measured on the fixture.**
- The Stochastic's windows and sliding averages agree to 1e-9 however much history precedes
  a candle; this is pinned.
- Stoch RSI and ADX are Wilder-smoothed: below 1e-9 about 350 candles after the buffer's
  start, like ATR.
- SuperTrend below 1e-9 after about 250, and below 1e-3 after about 120 (its trend
  resynchronises at the first band cross).
- All are well inside the 2000-candle default buffer. Accepted, as for RSI and EMA.

## Decided: group 4 (2026-09-13)

Put to the product owner with measurements on the recorded fixture, and decided:

| Indicator | Decision | Measured |
|---|---|---|
| Parabolic SAR | A new `direction` output (+1 / −1) in the core, so the flip is an exact condition. `value` stays, so "close crosses SAR" stays possible | 79 flips; "close crosses SAR" catches 77 and never fires without one. It misses a flip reversed within one candle (967 / 968) |
| Ichimoku | Read the cloud where the chart draws it, displaced by 26. A card displaced by another number refuses to arm. No core change | TradingView displaces by 25; the close's side of the cloud differs on 19 of 922 candles between the two |
| OBV | Only against itself: an OBV condition may compare only with a window of its own OBV. The core refuses OBV against a number | 100 candles less history shifts the whole line by 9330, 500 by 80,014. Against its own window: 0 differences |

**Ichimoku (wired).**
- `span_a` and `span_b` are the displaced spans at the evaluated candle, as the chart draws them. `ICHIMOKU_DISPLACEMENT` in `alertPathIndicators.ts` is read by the series and by the settings seed.
- `cardAlertAvailability` answers `displacement-mismatch` for a card displaced by anything but 26; a missing displacement is drawn at 26 and agrees. The button names the displacement to set (`settings.technicals.alertIchimokuDisplacementMismatch`).
- The lagging span is the close of a later candle and is not a core output.
- The lines were 0 before their windows were full; that is fixed first in [`BUG-0463`](../bugs/BUG-0463-ichimoku-lines-zero-before-window.md).
- Every line is a window midpoint, so it does not depend on where the buffer starts; pinned exactly.

**Parabolic SAR (wired).**
- The core's `parabolic_sar` has two outputs now: `value` (price) and `direction` (unitless:
  +1 while the SAR trails below the price, −1 while it stands above). "The SAR flips short"
  is `direction` crossing below 0. Existing documents without an output still read `value`.
- `JSIndicators.psarLines` computes both from the one state machine the chart's `psar`
  now delegates to.
- The first candle's SAR is the seed (its own low) and has no value on the alert path: it
  only exists once a second candle does, which the causality test caught.
- Parity: the SAR is in `WASM_LOCATION` at 1e-9; WASM has no side, so `direction` is in
  `NOT_IN_WASM` and both lines are checked against Wilder's rules replayed in `Decimal`.
- Start-dependence: the SAR resynchronises at its first reversal after the buffer's
  start, within 50 candles on the fixture, and is exact after that.
- This is Cachy's (Wilder's) SAR, the one the chart draws. TradingView's `ta.sar` checks
  the reversal before clamping to the previous two candles and reverses to the extreme or
  the candle's own high, whichever is further; on the fixture the two differ on 142 of 940
  values. The contract is this app's chart.

**OBV (wired): the core refuses it against anything but its own window.**
- `RefusalCode::CumulativeNeedsOwnWindow`: a compare or cross reading OBV is accepted only
  when the other side is a window over the same OBV (`obv >= window(max, N, obv)` for a
  new N-candle high). A number, another volume line, the candle's volume, OBV against
  itself and a window against a window are refused, also inside groups.
- Which indicators this applies to is one list in the core (`CUMULATIVE` in
  `indicator.rs`), exported in the registry JSON as `cumulative` and mirrored by the
  catalogue, pinned by `indicatorCatalogue.test.ts`.
- Stored OBV rules armed before BUG-0451 are unaffected by the refusal alone: the alert
  path still computes no OBV, so they are reported unevaluable before the core is asked.
  Once OBV is computed they reach the core and are refused, and
  `BUG-0467` (PR #3269) makes that a
  report instead of a log line on every close. Wiring OBV in depends on it.
- **The builder gained the shape (decided 2026-09-13: for every indicator, not OBV
  alone).** The Indicators and Combo tabs offer "its own high or low" over N candles
  (`Reference` kind `window`, always over the subject). Against a window only the two
  comparisons that can be both true and false are offered (`≥`/`<` the highest, `≤`/`>`
  the lowest), since the window includes the evaluated candle. A cumulative indicator is
  offered nothing but its window and starts at its 20-candle high (`defaultForm`), which
  the card's seed inherits. This also makes squeeze and breakout conditions buildable for
  every indicator.

**A cross on an exact tie keeps the core's convention.** Ichimoku's conversion and base lines tie on 44 candles of the fixture, which exposed that both condition oracles defined a cross as TradingView does, not as the core does. The core stays and the oracles follow it: [`BUG-0464`](../bugs/BUG-0464-test-oracles-cross-convention.md).

**The warmup table is keyed by output line.** `warmupFor` matched id and parameters only, so a condition on span B (78 candles) took the conversion line's 9 and would have been asserted from candle 27. It now matches the output too; the Bollinger bandwidth, read by the squeeze expectation, got its own entry, and `indicatorWarmup.test.ts` pins that no entry promises a value before the series has one.

## Progress (2026-09-13, group 4)

- Ichimoku wired into the alert path and back in the panel. Recorded-history expectations: the TK cross, conversion crossing above base (25 flips), and the close crossing below span B (12)
- `BUG-0462` (PR #3259) found probing the Parabolic SAR: the panel read the start factor as the increment, up to 3263 from the chart's line
- Parabolic SAR wired, with its new `direction` output. Recorded-history expectations: the
  SAR flipping short (39 flips) and the close crossing below the SAR (38). The one flip only
  `direction` catches is candle 967, pinned in both
- The core refuses OBV against anything but a window over itself, and the Indicators and
  Combo tabs build "its own high or low" for every indicator
- OBV wired in and back in the panel, where it is offered only its own window and its card
  seeds "OBV at its 20-candle high". Recorded-history expectation: OBV at its 20-candle
  high (56 flips). Its level shifts with the buffer's start (pinned) and its place in its
  own window does not (pinned)
- The indicators builder now claims a condition exactly when it can read it
  (`indicatorFormOf`), which closes the indicators half of BUG-0444 and leaves a saved OBV
  rule against a number untouched rather than rewritten
- `SCOPED_OUT` is empty and the panel offers all 23 registry indicators; every acceptance
  criterion is met

## Progress (2026-09-13, group 3)

- Stochastic, Stoch RSI, ADX and SuperTrend wired into the alert path and back in the panel,
  each with warmup entries and a parity location or its named replacement. Recorded-history
  expectations:

  | condition | flips |
  |---|---|
  | Stochastic %K crossing above %D | 224 |
  | Stoch RSI %K below 20 | 83 |
  | ADX(14) above 25 | 40 |
  | +DI crossing above −DI | 78 |
  | the close crossing below SuperTrend(10, 3) | 24 |

- `SCOPED_OUT` is down to the three shape decisions of group 4: OBV, Parabolic SAR, Ichimoku

## Progress (2026-09-13, group 2)

- Williams %R, CCI, ATR, choppiness, MFI and AO wired into the alert path and back in the
  panel, each with a warmup entry, a parity location (AO: `NOT_IN_WASM` and a `Decimal`
  check) and a recorded-history expectation: %R(14) above −20 (150 flips), CCI(20) crossing
  above +100 (100), ATR(14) at its 50-candle high (62), choppiness(14) below 38.2 (46),
  MFI(14) above 80 (26), AO crossing above zero (44)
- Measuring parity surfaced three defects, each fixed in its own PR first:
  [`BUG-0455`](../bugs/BUG-0455-wasm-williams-r-choppiness-window.md) (the WASM %R and
  choppiness range read fifteen candles for fourteen, up to 41 and 30 points off) and
  [`BUG-0456`](../bugs/BUG-0456-js-atr-first-true-range-zero.md) (the JavaScript ATR seeded
  Wilder's average with a zero true range for the first candle). The parity shape guard now
  covers ATR as well as the MACD histogram
- [`BUG-0457`](../bugs/BUG-0457-chart-header-values-ignore-source.md) filed: the chart pane
  headers recompute RSI, MACD, Stoch RSI, CCI and Momentum over the close on every live tick

## Progress (2026-09-13, group 1)

- Momentum wired into the alert path and back in the panel: `ALERT_PATH_INDICATORS`,
  `computeIndicatorSeries` (`JSIndicators.mom`, the chart's function), warmup
  `Momentum(10)` needs 11, parity location `MOM10`, and the recorded-history expectation
  "momentum turning positive — Momentum(10) crossing above zero" (154 flips)
- [`BUG-0452`](../bugs/BUG-0452-wasm-momentum-off-by-one.md) surfaced on the way and was
  fixed first: the WASM momentum the Technicals panel shows was a change over one candle
  more than its period, 139.8 off at worst on the fixture
- [`BUG-0453`](../bugs/BUG-0453-card-alert-ignores-price-source.md) filed: an alert armed
  from an indicator card is computed on the close whatever source the card is set to
- OBV moved to group 4 (above)

## Progress (2026-09-13)

- EMA(20), WMA(20), VWMA(20) and HMA(20) — computable and offered, but previously
  unproven — have recorded-history expectations, warmup entries and parity locations
- Two defects surfaced on the way, each fixed in its own PR:
  [`BUG-0449`](../bugs/BUG-0449-hma-alert-throws-and-silences-series.md) (an HMA alert
  threw on every close and silenced every rule after it on the series) and
  [`BUG-0450`](../bugs/BUG-0450-wma-sliding-sum-drift.md) (the JavaScript WMA drifted with
  series length, which failed HMA parity)
- `SCOPED_OUT` reasons rewritten from "no condition shipped" to what is true
- [`BUG-0451`](../bugs/BUG-0451-panel-offers-indicators-that-cannot-fire.md) filed and fixed:
  the panel offers only what the alert path computes

## Links

- [`FEAT-0438`](FEAT-0438-recorded-history-condition-correctness.md) — the suite and the fixture this extends
- [`FEAT-0028`](FEAT-0028-indicator-alerts.md) — the conditions that were shipped
- `src/lib/alerts/indicatorCatalogue.ts` — `REGISTRY_CATALOGUE` (all 23) and `INDICATOR_CATALOGUE` (what the panel offers)
- `src/services/alertEngine/indicatorWarmup.ts` — the shared warmup table
- `src/lib/rules/alertPathIndicators.ts` — `ALERT_PATH_INDICATORS`, the ids the alert path computes
