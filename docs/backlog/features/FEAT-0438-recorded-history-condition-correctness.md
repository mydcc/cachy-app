---
id: FEAT-0438
title: Prove every indicator condition against recorded history
type: feature
status: in-progress
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: C
adr: ADR-0012
depends_on: [FEAT-0028]
size: M
estimate: 5
assignee: claude-code
start_date: 2026-09-13
---

# FEAT-0438 — Prove every indicator condition against recorded history

## Problem

[`FEAT-0028`](FEAT-0028-indicator-alerts.md) acceptance criterion 1 — "each condition
fires correctly against recorded historical data, tested per indicator" — is the one
criterion that cannot be satisfied by making the code run. A condition that evaluates
without throwing is not a condition that fires on the right candle, and an indicator
alarm that fires on the wrong candle is worse than no alarm: the trader acts on it.

The criterion has no fixture, no candle count, and no per-indicator expectation today.
`indicatorConditions.integration.test.ts` proves conditions *evaluate*; nothing proves
they evaluate *correctly* against a known-good series.

## Proposal

One committed fixture of **1000 closed candles**, and a per-indicator assertion driven
by warmup length rather than by a single global candle count.

**Why 1000, and why not one number for every indicator.** Warmup differs per indicator.
A 50/200 moving-average cross has no value at all before candle 200, so a 100-candle
fixture cannot test it — it can only test that it is absent. And short series make
seeding drift indistinguishable from a genuine cross, which is exactly the failure
[`BUG-0430`](../bugs/BUG-0430-macd-seeding-mismatch.md) describes. The convention used
for cross-path work is the same one the financial literature uses for cross backtests:
assert only after **three times the slow period**. For MA-200 that is 600 candles; 1000
covers every parameterisation `IndicatorRef` can currently express, at roughly 80 KB of
committed JSON.

**Reuse the existing table, do not invent a second one.**
[`crossPathParity.test.ts`](../../../src/services/alertEngine/crossPathParity.test.ts)
already carries a `MAPPING` with a `needs` field per indicator and filters its
assertions by it. This item extends that table rather than defining a parallel notion
of "enough history".

Per condition, the fixture must contain at least one candle where the condition is
true and one where it is false, and the test asserts the **index** at which it flips —
not merely that it flipped somewhere.

## Acceptance criteria

- [x] A 1000-candle OHLCV fixture is committed under `src/services/__fixtures__`, with
      its symbol, timeframe, and capture date recorded in the file
- [x] Every condition shipped by FEAT-0028 (MACD cross and histogram sign change, DEA
      zero crossing, RSI thresholds, Bollinger touch and squeeze, volume anomalies, MA
      crosses) has a test asserting the exact candle index at which it flips
- [x] Each indicator is asserted only after `needs × 3` candles of history, using the
      `MAPPING.needs` table rather than a per-test constant
- [x] Every condition has at least one true and one false candle in the fixture — a
      condition that is never true in the fixture fails the suite rather than passing
      vacuously
- [x] A condition added to FEAT-0028 without a fixture expectation fails the suite
- [x] The fixture is public market data only (Class C): no symbol watchlist, account,
      or identity data of any kind

## Out of scope

- Cross-engine parity — [`FEAT-0439`](FEAT-0439-webgpu-cross-path-parity.md) owns that.
  This item proves one engine correct against history; that one proves the engines agree.
- Live or recorded WebSocket replay. The fixture is a static closed-candle series.
- Corrected-candle double-firing — already covered by
  `correctedCandle.integration.test.ts`.

## Decided: BTCUSDT on `1h`

One file, 1000 candles, 2026-08-02 to 2026-09-12. The series trends 62.5k to 81.7k with
a pullback, and carries a volume range of 91 to 17909 against a median of 851 — a 200×
spike, which is a shape the generated walk does not produce and which is exactly what a
volume-anomaly condition needs to meet. The thin-pair second fixture is not taken: one
series that every indicator can warm up on is worth more than two that must be kept in
step.

## Progress (2026-09-13)

### The trap this had to avoid

The obvious reading of "assert the exact candle index" is a snapshot: run the evaluator,
copy the indices, assert them. That proves the evaluator still does what it did — and if
it fires one candle late, firing one candle late becomes the specification.

So the literals in `EXPECTATIONS` are pinned against an **oracle**, plain array indexing
in the test file, and the evaluator is then required to match the same literals. Three
things must coincide, and only two of them share any code: the oracle's flips equal the
literals, the evaluator's flips equal the literals, and the two agree at *every* candle
rather than only at the flips. A fixture swap breaks the first. An oracle drifting toward
the implementation breaks the first while the second still passes, which is the failure
the literals exist to catch.

### One table, not two

`MAPPING.needs` moved out of `crossPathParity.test.ts` into
`src/services/alertEngine/indicatorWarmup.ts`, and both suites import it. What stayed
behind is the part only the parity test knows — which group and key a value arrives under
in the WASM result — and an entry added to the shared table without a location fails that
file by name.

Adding SMA(50) and SMA(200) for a real golden cross then broke a parity test, correctly:
`TechnicalsCalculator.initialize` decides once from the history it is handed, so an
SMA(200) seeded with 120 candles stays silent for the whole run rather than starting
late. That test asserted `divergence.size === MAPPING.length` at a hardcoded 120 candles,
which SMA(200) cannot satisfy on a 400-candle fixture at any seeding point: it needs
`startIndex >= 200`, which leaves at most 200 samples, and the test demands more than
200. The expectation now comes from the table (`needs <= START`) instead of the row
count; SMA(200)'s parity coverage is the 250-candle sweep.

### What the fixture is worth

Twelve conditions, 39 tests, roughly 70 seconds. The agreement and non-vacuity
assertions passed on the first run — the evaluator and the oracle agree at every candle
of recorded history for all twelve — so what this change adds is proof rather than a
repair.

### The gap this turned up, and did not close

`rule_indicator_registry()` accepts 23 indicators and `indicatorCatalogue.ts` offers all
of them. This suite covers five. The other eighteen — ADX, Stochastic, Ichimoku,
Parabolic SAR and the rest — are reachable from the Indicators tab today, and nothing
says they fire on the right candle.

Closing that is not this item's scope; its criteria enumerate the FEAT-0028 conditions.
What is in scope is refusing to let the gap be invisible: they are named one by one in
`SCOPED_OUT`, with a reason each, and the coverage test asserts
`registry ⊆ covered ∪ SCOPED_OUT`. An indicator added to the core lands in neither set
and fails the suite, which is what criterion 5 actually asks for. A second test rejects a
`SCOPED_OUT` entry for something that *is* covered, because a list of gaps that outlives
the gap reads as missing coverage that is not missing.
[`FEAT-0446`](FEAT-0446-recorded-history-remaining-indicators.md) owns emptying it.

## Links

- [`FEAT-0028`](FEAT-0028-indicator-alerts.md) — the parent item, acceptance criterion 1
- [`BUG-0430`](../bugs/BUG-0430-macd-seeding-mismatch.md) — the warmup failure this scope is sized against
- `src/services/alertEngine/crossPathParity.test.ts` — the `MAPPING.needs` table to extend
- `src/services/alertEngine/indicatorConditions.integration.test.ts` — proves evaluation, not correctness
- `technicals-wasm/src/rule/indicator.rs` — `IndicatorRef` identity and parameters
