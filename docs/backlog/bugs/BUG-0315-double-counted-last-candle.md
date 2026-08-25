---
id: BUG-0315
title: wasmCalculator double-counts the last candle in initialize and update
type: bug
status: in-progress
priority: P0
milestone: none
editions: [community, pro, private]
area: calculation
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0315 — wasmCalculator double-counts the last candle in initialize and update

## Symptom

Every rolling-window indicator computed through the WASM path (SMA, WMA, VWMA,
Bollinger Bands, MOM, VolMa, Stoch, Williams %R, CCI) is calculated with the
last candle counted twice. These values feed Buy/Sell action labels — wrong
numbers can lead to wrong trade decisions with real money.

## Evidence

**Derived** (from reading the code; the module's own test defines the correct
protocol):

- `src/services/wasmCalculator.ts:128-224` initializes on **all** klines
  (including `klines[klines.length - 1]`) and then calls `update()` with that
  same last candle.
- The Rust test `test_initialize_and_update_are_exact` in
  `technicals-wasm/src/` documents the intended contract: initialize on
  history `[0.1, 0.2, 0.3]`, then `update("0.4")` with a *new* candle →
  SMA3 = 0.3 exactly.
- Concrete distortion for SMA(n): series `[a,b,c,d]`, n=3 currently yields
  `(c + 2d) / 3` instead of `(b + c + d) / 3`.
- Recursive indicators (EMA/MACD/ATR/ADX/SuperTrend) are distorted only
  mildly (re-applying an identical close is near a no-op), rolling-window
  indicators materially.

This bug needs a reproducing parity test **before** the fix lands
(BUG-0317 provides it); per repo discipline a derived fix without a failing
test first would be a guess.

## Cause

The TS consumer violates the module's initialize/update protocol by passing
the full series as history instead of `history[:-1]`.

## Fix

- In `wasmCalculator.calculate()`, pass `klines.slice(0, -1)` to
  `initialize(...)` and keep `update(lastCandle)` — semantics then match the
  module contract and its Rust test.
- Fold in two small numeric nits in the same file area while there:
  RSI must return exactly `100` when `avg_loss == 0` (currently ≈99.01 via
  `rs = 100`), and verify whether the Stochastic `smooth` setting is applied
  on the TS side; only change behavior if divergence is confirmed.
- Gate everything with the revived parity test (BUG-0317).

## Acceptance criteria

- [ ] A parity test demonstrates the double-count on the unfixed code
      (rolling-window indicator diverges from the TS calculator).
- [ ] With the fix, WASM output for SMA/WMA/BB/Stoch equals the TS
      StatefulTechnicalsCalculator output exactly (decimal-string equality)
      over a golden series.
- [ ] RSI returns exactly `"100"` for an all-gains window.
- [ ] Existing Rust tests still pass; extended tests document init+update
      exactness.
- [ ] `npm run check` and targeted vitests pass.

## Out of scope

- Implementing missing indicator states (FEAT-0316).
- Boundary/performance changes (IDEA-0318).
- Changing the routing threshold (IDEA-0318 — measure first).

## Links

- `src/services/wasmCalculator.ts`
- `technicals-wasm/src/lib.rs` (initialize/update/shift, RSI block)
- Depends conceptually on BUG-0317 for proof; both land together.
- Branch: fix/wasm-indicator-parity
