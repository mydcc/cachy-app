---
id: BUG-0458
title: The JavaScript SuperTrend never has a value
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
branch: fix/bug-0458-js-supertrend-never-seeds
start_date: 2026-09-13
---

# BUG-0458 — The JavaScript SuperTrend never has a value

## Symptom

`JSIndicators.superTrend` returns `NaN` for the SuperTrend line on every candle, and a trend
of "up" on every candle, whatever the market does.

It reaches:

- the chart's SuperTrend overlay (`indicatorLayer.ts`), which draws nothing
- the JavaScript Technicals calculator (`technicalsCalculator.ts`), whose SuperTrend row
  read `NaN` and `BULL` wherever that path ran
- `calculateSuperTrend`

The WASM Technicals calculator has its own implementation and is not affected.

## Evidence

**Demonstrated.** Found probing JavaScript ↔ WASM parity for FEAT-0446 group 3. On the
recorded 400-candle fixture, SuperTrend(10, 3):

| | before | after |
|---|---|---|
| candles with a value | 0 of 400 | 390 of 400 (from candle 10) |
| trend against WASM | stuck on "up"; differs wherever WASM is down | identical on every compared candle |
| bands against WASM, worst | — | 7.3e-12 at 40, 120 and 250 candles of seeding |

## Cause

```ts
const finalUpper = new Float64Array(len).fill(NaN);
// ...
if (basicUpper[i] < finalUpper[i - 1] || close[i - 1] > finalUpper[i - 1]) {
  finalUpper[i] = basicUpper[i];
} else {
  finalUpper[i] = finalUpper[i - 1];
}
```

The final bands start as `NaN`. Both comparisons against `NaN` are false, so every candle
copies the previous candle's `NaN`. Nothing ever seeds the bands, so the value never exists
and the trend comparisons never flip.

A second, smaller divergence sat behind it: the trend rule compared the close with the
**previous** candle's band, where the WASM core and TradingView's `ta.supertrend` compare
it with the **same** candle's band.

## Fix

- The first candle with an ATR starts from its basic bands, in an uptrend. That is the WASM
  core's seed.
- Each later candle tightens or resets its bands as before, and flips on a close through
  this candle's band.
- `superTrend` also returns the final `upper` and `lower` bands. The core registry declares
  them as outputs of `super_trend`, and they are what the parity above is measured on.
- `calculateSuperTrend` returns `null` until `period + 1` candles exist. The first candle
  has no true range (BUG-0456), so that is the first candle with a value.
- `technicalsCalculator.ts` leaves `advanced.superTrend` absent until there is a value,
  instead of `NaN`. The panel already hides an absent row.

## Acceptance criteria

- [x] A test pins the seed from the basic bands and failed without the fix
      (`indicators.test.ts`, `describe("superTrend")`)
- [x] A test pins the flip on a close through the same candle's band, below the new lower
      band but not below the previous one
- [x] A test pins no value before a full period of true ranges, for `superTrend` and
      `calculateSuperTrend`
- [x] The indicator, technicals and chart suites stay green

## Out of scope

- **The starting trend.** The seed candle starts in an uptrend, as the WASM core does.
  TradingView's `ta.supertrend` starts in a downtrend. The two agree from the first flip on.
  Kept on the WASM convention so the two engines agree; changing both is its own decision.
- The WebGPU SuperTrend shader is a separate engine;
  [`FEAT-0439`](../features/FEAT-0439-webgpu-cross-path-parity.md) owns its parity.

## Links

- `src/utils/indicators.ts` — `superTrend`, `calculateSuperTrend`
- `src/utils/technicalsCalculator.ts` — the Technicals row
- `technicals-wasm/src/lib.rs` — the WASM seed and update this now mirrors
- [`FEAT-0446`](../features/FEAT-0446-recorded-history-remaining-indicators.md) — group 3
  needs SuperTrend on the alert path
