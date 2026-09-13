---
id: BUG-0456
title: The JavaScript ATR counts a true range of zero for the first candle
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
branch: fix/bug-0456-js-atr-first-true-range
start_date: 2026-09-13
---

# BUG-0456 — The JavaScript ATR counts a true range of zero for the first candle

## Symptom

`JSIndicators.atr` feeds Wilder's smoothing a true range of **0** for the first candle of
the series. That candle has no previous close, so it has no true range at all. The zero
lands in the seed average, and every Wilder step after it inherits the bias:

| candles of seeding | JS ↔ WASM ATR(14), worst |
|---|---|
| 40 | 1.84 |
| 120 | 4.9e-3 |
| 250 | 3.2e-7 |

at BTC scale on the recorded fixture. It decays as `(13/14)^k`, so it falls below 1e-9 only
after roughly 360 candles.

It reaches ATR itself, `calculateATR`, the TechnicalsCalculator fallback's ATR, SuperTrend
and the ATR trailing stop — all near the start of whatever history they are given.

Honest scale: P3. On a chart with thousands of candles the visible end is unaffected. It is
fixed because it made the first `period` values plainly wrong, and because it failed the
1e-9 parity bound FEAT-0446 group 2 needs to put ATR on the alert path.

## Evidence

**Demonstrated.** Found measuring JavaScript ↔ WASM parity for FEAT-0446 group 2: the
divergence above shrinks with seeding length, which marks a seed difference rather than a
structural one. By hand, true ranges `4, 5, 1, 7` from candle 1 and ATR(3): JavaScript
gave `7/3` at candle 3 where the mean of the first three real true ranges is `10/3`.

## Cause

```ts
tr.fill(0);
for (let i = 1; i < len; i++) tr[i] = /* true range */;
this.smma(tr, period, result);
```

`tr[0]` stays 0, and `smma` seeds from the first `period` values, including it.

## Fix

- `tr[0] = NaN`. `smma` already starts after leading NaNs, so the first ATR is the mean of
  the first `period` real true ranges at candle `period`. That is the WASM core's seed, and
  the parity bound now holds from 40 candles of seeding.
- `calculateATR` returns `null` until `period + 1` candles exist, instead of a NaN `Decimal`.
- `technicalsCalculator.ts` leaves `volatility.atr` absent rather than NaN in the same case.
  The panel already hid a falsy value, but the AI context and the background signal read
  it.

## Acceptance criteria

- [x] A test pins the seed (`10/3`, then Wilder's step to `41/9`) and failed without the fix
- [x] A test pins no value before a full period of true ranges, for `atr` and
      `calculateATR`
- [x] The indicator, technicals, chart and background suites stay green

## Out of scope

- The WebGPU ATR (`webGpuCalculator.ts`) is a separate engine;
  [`FEAT-0439`](../features/FEAT-0439-webgpu-cross-path-parity.md) owns its parity.

## Links

- `src/utils/indicators.ts` — `atr`, `calculateATR`
- `src/utils/indicators.test.ts` — `describe("atr")`
- [`FEAT-0446`](../features/FEAT-0446-recorded-history-remaining-indicators.md) — the parity work that surfaced it
