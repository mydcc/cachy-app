---
id: BUG-0452
title: The WASM momentum is a change over one candle more than its period
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
branch: fix/bug-0452-wasm-momentum-off-by-one
start_date: 2026-09-13
---

# BUG-0452 — The WASM momentum is a change over one candle more than its period

## Symptom

The Technicals panel shows "Momentum 10" from the WASM calculator, together with a Buy or
Sell label taken from its sign. That value was the close against the close **eleven**
candles back, not ten. The chart's momentum pane and the JavaScript fallback
(`JSIndicators.mom`) compute the change over ten, which is the standard definition
(`close − close[n]`).

So the same indicator with the same setting showed two different numbers depending on
which engine computed it — and at BTC scale the difference is not rounding. On the
recorded BTCUSDT `1h` fixture, candle 40 showed **854.2** where the momentum over ten is
**1026.9**; candle 42 showed 827.3 against 179.6. Where the two lags straddle a turn, the
sign differs, and with it the Buy/Sell label.

No alert fired or stayed quiet because of it: alerts compute momentum on the JavaScript
path, and until FEAT-0446 group 1 they could not read momentum at all.

## Evidence

**Demonstrated.** Found when FEAT-0446 group 1 added `Momentum(10)` to
`crossPathParity.test.ts`: worst difference 139.8 at candle 163. A probe against the
committed artefact over the whole fixture: the WASM `MOM10` equalled
`close[i] − close[i − 11]` exactly at **960 of 960** candles, and `close[i] − close[i − 10]`
at none.

## Cause

`TechnicalsCalculator::update` is handed a candle that is not in `price_history_closes`
yet, so `n` candles back is `history[history.len() − n]` — which is how SMA reads it a few
lines above. Momentum read `history[history.len() − n − 1]`, one further.

## Fix

Read `history[history.len() − n]`, and require `n` candles of history rather than `n + 1`.
The artefact in `static/wasm` is rebuilt in the same change; only `_bg.wasm` differs, so
the export surface is unchanged.

## Acceptance criteria

- [x] A Rust test reproduces the defect and fails without the fix (`MOM10` was 165, not 160)
- [x] A test against the committed artefact asserts exact decimal equality with
      `close[i] − close[i − 10]` at every candle of the recorded fixture, and failed on the
      stale binary
- [x] The artefact is rebuilt and `npm run check:wasm` passes

## Out of scope

- The WASM calculator computes momentum on the close whatever source the card is set to.
  That belongs with how card sources reach the calculations at all, not with this lag.

## Links

- `technicals-wasm/src/lib.rs` — `TechnicalsCalculator::update`, momentum
- `src/services/wasmMomentum.test.ts` — the artefact test
- `src/services/wasmCalculator.ts` — where `MOM<n>` becomes the panel's Momentum row
- [`FEAT-0446`](../features/FEAT-0446-recorded-history-remaining-indicators.md) — the parity extension that surfaced it
