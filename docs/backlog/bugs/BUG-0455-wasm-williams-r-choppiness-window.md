---
id: BUG-0455
title: The WASM Williams %R and choppiness read a high/low window one candle too long
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
branch: fix/bug-0455-wasm-wr-chop-window
start_date: 2026-09-13
---

# BUG-0455 — The WASM Williams %R and choppiness read a high/low window one candle too long

## Symptom

The Technicals panel shows Williams %R and the Choppiness Index from the WASM calculator.
Both took their highest high and lowest low over **one candle more** than their period:

- **Williams %R(14)** was %R over fifteen candles
- **Choppiness(14)** summed fourteen true ranges but divided by the range of fifteen
  candles

The chart and the JavaScript fallback compute both over fourteen, which is the definition.
On the recorded BTCUSDT `1h` fixture the panel was up to **41 points** off for %R and
**30 points** for choppiness at candle 813 — enough to show a market as overbought when it
is not, or as trending when it is choppy.

No alert was affected: neither indicator could be read by an alert before FEAT-0446
group 2, and alerts compute on the JavaScript path.

## Evidence

**Demonstrated.** Found while FEAT-0446 group 2 measured JavaScript ↔ WASM parity. A probe
against the committed artefact, comparing with `Decimal` references over the whole fixture
within 1e-9:

| WASM output | matches the window of 14 | matches the window of 15 |
|---|---|---|
| `WR14` | 650 / 960 | **960 / 960** |
| `CHOP14` (range) | 650 / 960 | **960 / 960** |

The 650 are candles where the fifteenth candle happens not to hold the extreme.

## Cause

The same shape as [`BUG-0452`](BUG-0452-wasm-momentum-off-by-one.md).
`TechnicalsCalculator::update` receives the candle it updates outside the history, and
both windows were counted from the history alone before the current candle was added:

- `wr`: `start = history.len() − len`, plus the current candle → `len + 1`
- `chop`: the `highs`/`lows` buffers hold `len` candles, all read, plus the current one.
  `sum_tr` next to them correctly drops its front.

## Fix

- `wr`: `start = history.len() + 1 − len`
- `chop`: skip the oldest buffered high and low, as `sum_tr` skips the oldest true range
- `static/wasm` rebuilt; only `_bg.wasm` changes

## Acceptance criteria

- [x] Rust tests reproduce both and failed without the fix (`WR3` −38.46 for −41.67,
      `CHOP3` 76.12 for 83.40)
- [x] A test against the committed artefact checks both against textbook `Decimal`
      references at every candle of the recorded fixture, and failed on the stale binary
- [x] The artefact is rebuilt and `npm run check:wasm` passes

## Out of scope

- A flat window (highest high equal to lowest low) is undefined for both. WASM answers −50
  for %R and 0 for choppiness, and JavaScript answers 0 for both. Neither is right, but
  what an *alert* reads there is decided on the alert path in FEAT-0446 group 2.

## Links

- `technicals-wasm/src/lib.rs` — `TechnicalsCalculator::update`, `wr` and `chop`
- `src/services/wasmIndicatorWindows.test.ts` — the artefact test (was `wasmMomentum.test.ts`)
- [`FEAT-0446`](../features/FEAT-0446-recorded-history-remaining-indicators.md) — the parity work that surfaced it
