---
id: FEAT-0438
title: Prove every indicator condition against recorded history
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

- [ ] A 1000-candle OHLCV fixture is committed under `src/services/__fixtures__`, with
      its symbol, timeframe, and capture date recorded in the file
- [ ] Every condition shipped by FEAT-0028 (MACD cross and histogram sign change, DEA
      zero crossing, RSI thresholds, Bollinger touch and squeeze, volume anomalies, MA
      crosses) has a test asserting the exact candle index at which it flips
- [ ] Each indicator is asserted only after `needs × 3` candles of history, using the
      `MAPPING.needs` table rather than a per-test constant
- [ ] Every condition has at least one true and one false candle in the fixture — a
      condition that is never true in the fixture fails the suite rather than passing
      vacuously
- [ ] A condition added to FEAT-0028 without a fixture expectation fails the suite
- [ ] The fixture is public market data only (Class C): no symbol watchlist, account,
      or identity data of any kind

## Out of scope

- Cross-engine parity — [`FEAT-0439`](FEAT-0439-webgpu-cross-path-parity.md) owns that.
  This item proves one engine correct against history; that one proves the engines agree.
- Live or recorded WebSocket replay. The fixture is a static closed-candle series.
- Corrected-candle double-firing — already covered by
  `correctedCandle.integration.test.ts`.

## Open questions

- Which symbol and timeframe. A single liquid pair on `1h` (1000 candles ≈ 42 days) gives
  every indicator its warmup and keeps the fixture one file. A second fixture on a thin
  pair would test volume anomalies harder, at the cost of a second thing to maintain.

## Links

- [`FEAT-0028`](FEAT-0028-indicator-alerts.md) — the parent item, acceptance criterion 1
- [`BUG-0430`](../bugs/BUG-0430-macd-seeding-mismatch.md) — the warmup failure this scope is sized against
- `src/services/alertEngine/crossPathParity.test.ts` — the `MAPPING.needs` table to extend
- `src/services/alertEngine/indicatorConditions.integration.test.ts` — proves evaluation, not correctness
- `technicals-wasm/src/rule/indicator.rs` — `IndicatorRef` identity and parameters
