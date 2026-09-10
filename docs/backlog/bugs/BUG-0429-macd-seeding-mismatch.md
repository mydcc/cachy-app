---
id: BUG-0429
title: MACD seeded differently in WASM than everywhere else
type: bug
status: done
priority: P1
milestone: M4
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
start_date: 2026-09-10
target_date: 2026-09-10
size: S
estimate: 1
---


# BUG-0429 — MACD seeded differently in WASM than everywhere else

## Symptom

The MACD line, signal and histogram computed by the WASM calculator disagreed
with every other implementation in the project, by an amount that depended on
how much history the calculator had been given. On a short history the two did
not merely differ in the last digits — they disagreed about the sign.

## Evidence

Found while building the cross-path parity test for
[`FEAT-0028`](../features/FEAT-0028-indicator-alerts.md) acceptance criterion 4.

`technicals-wasm/src/lib.rs` seeded MACD's two internal EMAs with `closes[0]`
and iterated from there, while the standalone EMA a dozen lines above in the
same function seeds with the SMA of the first `length` closes — which is also
what `src/utils/indicators.ts` does. So this was not a convention chosen and
applied; it was one place doing something the rest of the module did not.

A seed gap in an EMA decays geometrically, at `(1 - k)` per candle, so the
disagreement shrank with history rather than staying put — which is why it had
never shown up as an obviously wrong chart. Measured against the JS path over a
400-candle series, worst relative difference:

| History | MACD line | Signal | Histogram |
|---:|---:|---:|---:|
| 40 candles | 170% | 399% | 72% |
| 80 candles | 14.9% | 5.4% | 16.4% |
| 150 candles | 0.02% | 0.15% | 0.05% |
| 250 candles | 1.4e-7 | 9.8e-8 | 3.1e-7 |

The core asks for 27 candles of warmup before it will evaluate a MACD rule
(`rule_warmup_candles`), so a trader could arm "histogram crosses zero" on a
freshly loaded chart and have the alert engine and the chart disagree about
which side of zero the histogram was on.

Alerts read the JS path only, so alerts were self-consistent. The mismatch was
between what the trader saw and what the engine used.

## Fix

`initialize` now seeds both MACD EMAs from the SMA of their first `fast` /
`slow` closes, matching the standalone EMA in the same function and the JS
path. The signal line is seeded from the SMA of the first `signal` values of
the MACD line, which requires walking all three in lockstep rather than in
separate passes.

`update` and `shift` are unchanged — they were always a pure recursion from
state, and only the seeding was wrong.

## Acceptance criteria

- [x] WASM and JS agree on MACD line, signal and histogram to within `f64`
      noise at every history length, not only after long warmup
- [x] A parity test asserts it and fails if a seed gap returns
- [x] The module's own Rust tests still pass

## Resolution

**RESOLVED** (2026-09-10). Worst absolute difference on the histogram fell from
1.7 to 9.4e-12 — twelve orders of magnitude — and no longer depends on how much
history the calculator was given.

`src/services/alertEngine/crossPathParity.test.ts` guards it two ways: an
absolute tolerance of `1e-9` (f64 noise at this fixture's price scale is around
1e-11), and a shape assertion that disagreement no longer shrinks with more
history. The second one matters more: a tolerance alone would keep passing if
someone reintroduced a seed gap that converged a little faster.

Chart MACD values change slightly for the first few hundred candles of any
series. That is the point of the fix, not a side effect.

## Links

- [`FEAT-0028`](../features/FEAT-0028-indicator-alerts.md) — acceptance criterion 4
- [`BUG-0005`](BUG-0005-gpu-chop-field-mismatch.md) — the other cross-path mismatch
- `technicals-wasm/src/lib.rs`, `src/utils/indicators.ts`
