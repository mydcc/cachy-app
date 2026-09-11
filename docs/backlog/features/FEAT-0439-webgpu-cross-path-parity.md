---
id: FEAT-0439
title: Close the WebGPU leg of cross-path indicator parity
type: feature
status: specced
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: C
adr: ADR-0012
depends_on: [FEAT-0028]
size: M
estimate: 5
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

- [ ] All six GPU-backed indicators (`sma`, `ema`, `rsi`, `atr`, `vwap`, `stochRaw`) are
      compared against the JS path in a real browser context with a live `navigator.gpu`
- [ ] The tolerance is derived from `f32` precision and series length and is justified in
      the test, not a hand-tuned constant
- [ ] An indicator that cannot meet its derived bound produces a documented discrepancy
      entry, and the docs say which path the chart and the evaluator each use
- [ ] With no GPU adapter available the suite reports "not run" and fails loudly rather
      than reporting success
- [ ] MACD and Bollinger are recorded in FEAT-0028 as having no GPU path, so AC4 reads as
      satisfied-with-scope rather than as an open gap
- [ ] A new shader added to `webGpuCalculator` without a parity case fails the suite

## Out of scope

- WASM↔JS parity — already shipped in `crossPathParity.test.ts`. This item adds one leg.
- Writing new shaders. If MACD or Bollinger should get a GPU path, that is its own item.
- GPU performance. This is a correctness gate, not a benchmark.

## Open questions

- Whether CI runners have a usable GPU adapter. If not, the suite is a local and
  pre-release gate, and that limitation belongs in `AGENTS.md` next to the verification
  standard rather than being discovered by the first person who trusts a green CI run.

## Links

- [`FEAT-0028`](FEAT-0028-indicator-alerts.md) — the parent item, acceptance criterion 4
- [`FEAT-0438`](FEAT-0438-recorded-history-condition-correctness.md) — correctness against history; this item is agreement between engines
- `src/services/alertEngine/crossPathParity.test.ts` — the two finished legs and the `MAPPING` table
- `src/services/webGpuCalculator.ts` — the six shaders that define this item's scope
- `src/lib/rules/indicatorSeries.ts` — why JS is normative for evaluation
