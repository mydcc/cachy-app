---
id: BUG-0459
title: Both ADX engines seed Wilder's averages differently from the definition
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
assignee: claude-code
branch: fix/bug-0459-adx-wilder-seed
start_date: 2026-09-13
---

# BUG-0459 — Both ADX engines seed Wilder's averages differently from the definition

## Symptom

The ADX the Technicals panel and the chart show is wrong near the start of whatever
history it is computed over. The two engines are wrong in different ways, so they also
disagree with each other.

- **JavaScript** (`JSIndicators.adx`, `calculateADXSeries`: the chart's ADX pane, the
  JavaScript Technicals calculator): the ADX and both DI lines start one candle early and
  seed from a first candle that has no movement.
- **WASM** (the Technicals panel's default engine): the DI lines are right, but the first
  ADX is a single DX value instead of the mean of the first `period` of them.

Worst distance from the definition, ADX(14) on the recorded fixture, in index points:

| | ADX | +DI / −DI |
|---|---|---|
| JavaScript, from its first value | 0.49 at candle 27 | 0.24 / 0.22 at candle 27 |
| JavaScript, from candle 120 / 250 | 2.3e-3 / 6.2e-7 | 1.9e-4 / 5.9e-9 |
| WASM, seeded with 40 candles | **11.8** (37.39 for 25.55 at candle 40) | exact |
| WASM, seeded with 120 / 250 | 3.2e-2 / 2.1e-6 | exact |
| **after the fix, both engines** | ≤ 1.5e-12 | ≤ 8.0e-13 |

Both errors decay geometrically, as Wilder's smoothing forgets its seed, so a chart with
thousands of candles shows the right number at its right edge. A panel seeded with a
short history does not.

## Evidence

**Demonstrated.** Found probing JavaScript ↔ WASM parity for FEAT-0446 group 3, which puts
ADX on the alert path: the two disagreed by 13.8 at 40 candles of seeding, falling to 4e-6
at 250, the shape of a seed difference. A `Decimal` reference by the definition then showed
that neither engine matched it.

The definition (Wilder; TradingView's `ta.dmi`):

1. The first candle has no previous candle, so it has no true range and no directional
   movement.
2. The true range and both directional movements are smoothed from the mean of their first
   `period` values, at candle `period`, then by Wilder's step.
3. DX exists from candle `period`. The ADX is smoothed from the mean of the first `period`
   DX values, at candle `2 × period − 1`, then by Wilder's step.

## Cause

- **JavaScript** filled the first candle's true range and movements with `0` and smoothed
  from index 0 — the same defect as the ATR's
  [`BUG-0456`](BUG-0456-js-atr-first-true-range-zero.md). The zero entered every seed, and
  every line started one candle early. There were also two copies of the computation
  (`JSIndicators.adx` and `calculateADXSeries`).
- **WASM** `initialize` started its DX loop one candle after the seed, so the seed candle's
  DX never counted, and set the first ADX to the single DX at candle `2 × period − 1`.

## Fix

- **JavaScript:**
  - one implementation, `calculateADXSeries`. `JSIndicators.adx` returns its ADX line.
  - The first candle's true range and movements are `NaN`. `smma` starts after leading
    NaNs, so every seed is the mean of real values, and a line has no value until the
    definition gives it one.
- **WASM:** the DX loop starts at the seed candle, and the first ADX is the mean of the
  first `period` DX values.
  - The seed candle's DI now uses the same zero-true-range rule as `update`, instead of
    dividing by it.
  - `static/wasm` is rebuilt; only `_bg.wasm` changes.
- `technicalsCalculator.ts` leaves `advanced.adx` absent until there is a value. With too
  little history it used to show an ADX of 0, a "Weak Trend".

## Acceptance criteria

- [x] A `Decimal` reference by the definition checks the committed WASM artefact's ADX, +DI
      and −DI on every candle after 40 of seeding, and failed before the fix
      (`wasmIndicatorWindows.test.ts`)
- [x] The same reference checks the JavaScript ADX, +DI and −DI on every candle of the
      fixture, including no value before the first one, and failed before the fix
- [x] The indicator, technicals, chart, WASM and parity suites and the Rust tests stay green

## Out of scope

- **WASM's first ADX arrives late on a short history.** `initialize` requires more than
  `2 × period` candles, where the first ADX exists at `2 × period`. That is a missing value
  for two candles, not a wrong one.
- **Two ADX lengths.** The panel's card has a DI length and an ADX smoothing. The chart
  reads the DI length for both, and WASM and the alert seed read the smoothing. They differ
  only when a trader sets them apart; FEAT-0446 group 3 decides how an alert treats that.
- The WebGPU ADX is a separate engine;
  [`FEAT-0439`](../features/FEAT-0439-webgpu-cross-path-parity.md) owns its parity.

## Links

- `src/utils/indicators.ts` — `calculateADXSeries`, `JSIndicators.adx`
- `technicals-wasm/src/lib.rs` — ADX `initialize`
- `src/services/wasmIndicatorWindows.test.ts` — the reference and both checks
- [`FEAT-0446`](../features/FEAT-0446-recorded-history-remaining-indicators.md) — group 3
