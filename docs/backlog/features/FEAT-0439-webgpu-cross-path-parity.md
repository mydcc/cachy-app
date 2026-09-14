---
id: FEAT-0439
title: Close the WebGPU leg of cross-path indicator parity
type: feature
status: done
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: C
adr: ADR-0012
depends_on: [FEAT-0028]
size: M
estimate: 5
assignee: claude
start_date: 2026-09-14
branch: feat/feat-0439-webgpu-parity
---

# FEAT-0439 — Close the WebGPU leg of cross-path indicator parity

## Problem

[`FEAT-0028`](FEAT-0028-indicator-alerts.md) acceptance criterion 4 asks that conditions
produce identical results across the WASM, GPU and JS paths, "or the discrepancy is
documented". Two of the three legs are done:
[`crossPathParity.test.ts`](../../../src/services/alertEngine/crossPathParity.test.ts)
compares the committed WASM artefact against `computeIndicatorSeries` at a tolerance of
`1e-9`, driven candle by candle the way production drives it.

The WebGPU leg is untested, and the test file says why in its own header: WebGPU needs a
real `navigator.gpu`, which no Node test environment provides, and the rest of the
codebase mocks it wholesale.

This matters because the paths are not interchangeable in practice. `indicatorSeries.ts`
makes JS normative for alert evaluation, but the chart the trader reads while arming the
alert may be drawn from another path. A silent disagreement means the trader arms a rule
against one set of numbers and the engine fires on another.

## Proposal

Run the existing parity comparison in a browser context that has a real GPU adapter,
against the indicators the GPU path actually implements — and record the rest as
not-applicable rather than skipping them silently.

**The GPU path implements six indicators**, one shader each
([`webGpuCalculator.ts`](../../../src/services/webGpuCalculator.ts)): `sma`, `ema`,
`rsi`, `atr`, `vwap`, `stochRaw`. There is no MACD shader and no Bollinger shader. So
"all indicators" is not a scope choice — for MACD and Bollinger, AC4's GPU leg is not
merely untested, it is **not applicable**, and that belongs in writing next to the
criterion instead of looking like a gap somebody forgot.

Because the cost is the harness and not the indicator count, all six are covered. Picking
five of six would save nothing.

**Tolerance is not `1e-9` here.** WASM works in `rust_decimal` and JS in `f64`; the shaders
work in `f32`. A single-precision accumulator over hundreds of candles diverges from `f64`
by far more than `1e-9`, and EMA and VWAP accumulate. The tolerance must be derived from
`f32` epsilon and the series length, stated as such in the test, and any indicator that
cannot meet a derived bound is a documented discrepancy rather than a loosened constant.

**Where it runs.** Playwright, since it is the only harness in the repo with a real
browser. The suite must skip explicitly and loudly on a machine or CI runner without a
GPU adapter — reporting "no adapter, not run" — rather than passing green on nothing.

## Acceptance criteria

- [x] ~~All six GPU-backed indicators (`sma`, `ema`, `rsi`, `atr`, `vwap`, `stochRaw`) are
      compared against the JS path in a real browser context with a live `navigator.gpu`~~
      — the premise was stale, see "The scope was three times larger" below. All 16
      compute shaders and the four composites `calculate()` assembles from them are
      compared: 22 series, in `tests/gpu/webGpuParity.spec.ts`
- [x] The tolerance is derived from `f32` precision and series length and is justified in
      the test, not a hand-tuned constant — `tests/gpu/f32Bound.ts`
- [x] An indicator that cannot meet its derived bound produces a documented discrepancy
      entry, and the docs say which path the chart and the evaluator each use —
      `KNOWN_DISCREPANCIES` (four series, [`BUG-0475`](../bugs/BUG-0475-gpu-stages-start-before-their-input.md));
      paths in "Which path draws, which path decides" below
- [x] With no GPU adapter available the suite reports "not run" and fails loudly rather
      than reporting success
- [x] ~~MACD and Bollinger are recorded in FEAT-0028 as having no GPU path, so AC4 reads as
      satisfied-with-scope rather than as an open gap~~ — they have one. Both are
      composed from GPU shader passes and are now covered; FEAT-0028 records that instead
- [x] A new shader added to `webGpuCalculator` without a parity case fails the suite —
      every `.wgsl` file containing `@compute` must be named by a case

## Out of scope

- WASM↔JS parity — already shipped in `crossPathParity.test.ts`. This item adds one leg.
- Writing new shaders. If MACD or Bollinger should get a GPU path, that is its own item.
- GPU performance. This is a correctness gate, not a benchmark.

## Progress (2026-09-14)

### The scope was three times larger

The proposal counted six shaders and said MACD and Bollinger had no GPU path. The tree
has **16** compute shaders — `sma`, `wma`, `ema`, `vwma`, `rsi`, `stddev`, `stoch_raw`,
`atr`, `cci`, `adx`, `mfi`, `vwap`, `supertrend`, `choppiness`, `williams_r`,
`momentum` — and `calculate()` composes MACD from three EMA passes, Bollinger from the
SMA and standard-deviation passes, HMA from three WMA passes and the smoothed
stochastic from the raw one. "Not applicable" would have written a gap down as a
non-gap. The item was written against an older calculator; the criteria are kept above
with the premise struck, rather than silently rewritten.

The four composites were inline in `calculate()`. They are now the methods
`calculateMacd`, `calculateBollinger`, `calculateHma` and `calculateStochastic`, and the
VWAP session marker is `utcSessionStarts()` — so the suite runs the arithmetic that
reaches the chart instead of re-assembling it and testing itself. No behaviour changed.

### The CI question has an answer

Headless Chromium provides **SwiftShader**, a software WebGPU adapter that executes the
same `f32` shader arithmetic without a GPU. On this machine SwiftShader and the real
Intel Gen-11 adapter (`CACHY_GPU_VULKAN=1`) produced bit-identical results for all 22
series, so a runner without a GPU is not a reason for the suite not to run. What stops
it running in CI today is that no workflow runs Playwright at all; `npm run test:gpu`
is a local and pre-release gate, and `AGENTS.md` says so next to the verification
standard. Adding a CI job is not in this change.

### How the bound is derived

`tests/gpu/f32Bound.ts` carries the derivation. In short: the JS path is recomputed
with every input moved by one half `f32` step, the largest shift is the input
sensitivity, and `(1 + m)` covers the `m` further roundings the shader performs — `m`
is counted per case next to the arithmetic. No per-indicator error formula, so none can
be wrong per indicator.

The first version moved inputs uniformly, alternately and as highs-up-lows-down, and
broke on three cases for reasons that were the derivation's, not the GPU's: a uniform
shift cancels out of momentum and out of a MACD line, and alternating signs cancel out
of any lag that is even. The sign patterns are now taken from the bits of the candle
index, so every pair of candles, at any distance, is pulled apart by at least one of
them. That was a fix to the argument; no number was loosened to get there.

Against that bound, 18 of 22 series stay inside it at every candle (worst ratio 0.71).

### What the tests actually prove

Four mutations, each run against the finished suite:

- EMA's `α` changed from `2/(n+1)` to `2/(n+1.05)` fails EMA(20) from candle 25 and all
  three MACD series.
- `ATR(14)`'s documented last divergent candle moved from 46 to 45 fails with both
  messages: diverges past its candle, and the pinned candle is wrong.
- A new `@compute` shader file with no case fails the registry test by name.
- Chromium with WebGPU disabled fails with "NOT RUN — no WebGPU adapter"; nothing is
  skipped.

### Which path draws, which path decides

- **The evaluator** reads the JS path, always: `computeIndicatorSeries` over
  `JSIndicators` (`indicatorSeries.ts`).
- **The chart** reads whichever engine `calculationStrategy.selectEngine` picks. On
  `auto` that is WASM, or TS where WASM is unavailable. **WebGPU draws only when the
  trader sets the engine to GPU explicitly.** WASM↔JS agreement is
  `crossPathParity.test.ts`; GPU↔JS is this suite.

### Found, and not this change's to fix

- [`BUG-0475`](../bugs/BUG-0475-gpu-stages-start-before-their-input.md) — ATR, SuperTrend
  and the MACD signal start before their input has a value. At candle 33 the GPU's MACD
  signal is +7,976.87 where JS has −178.00. The divergence decays and is inside the
  bound from candle 83 on, so a 750-candle chart is not affected, but a short one is.
  Pinned in `KNOWN_DISCREPANCIES`.
- [`BUG-0476`](../bugs/BUG-0476-stoch-raw-shader-caps-lows-at-ten-million.md) — the raw
  stochastic shader starts its lowest low at 10,000,000. Latent; the fixture cannot
  reach it.

## Links

- [`FEAT-0028`](FEAT-0028-indicator-alerts.md) — the parent item, acceptance criterion 4
- [`FEAT-0438`](FEAT-0438-recorded-history-condition-correctness.md) — correctness against history; this item is agreement between engines
- `src/services/alertEngine/crossPathParity.test.ts` — the two finished legs and the `MAPPING` table
- `src/services/webGpuCalculator.ts` — the six shaders that define this item's scope
- `src/lib/rules/indicatorSeries.ts` — why JS is normative for evaluation
