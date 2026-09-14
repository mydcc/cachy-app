---
id: BUG-0475
title: The WebGPU path seeds ATR, SuperTrend and the MACD signal from values that do not exist yet
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: C
adr: none
depends_on: [FEAT-0439]
assignee: claude
start_date: 2026-09-15
branch: fix/bug-0475-gpu-warmup-seeding
---

# BUG-0475 — The WebGPU path seeds ATR, SuperTrend and the MACD signal from values that do not exist yet

## Symptom

A trader who sets the calculation engine to WebGPU and opens a chart with a short
history — a newly listed symbol, a weekly or monthly timeframe — reads an ATR, a
SuperTrend and a MACD signal line that disagree with the WASM and JS paths. On the
recorded BTCUSDT fixture the ATR(14) reads 190.12 where JS reads 187.73 (candle 14),
the SuperTrend(10,3) 63,625.86 where JS reads 62,568.19 (candle 10), and the MACD
signal +7,976.87 where JS reads −178.00 (candle 33) — so the histogram has the opposite
sign, and a MACD cross the chart shows is not the one an alert fires on. The alert
evaluator reads the JS path.

The divergence decays with each indicator's memory and is inside the `f32` bound from
candle 47 (ATR, SuperTrend), 83 (MACD signal) and 82 (MACD histogram) on. With the
default `historyLimit` of 750, `calculate()` reads only the newest candle and a long
chart is not affected.

## Evidence

**Measured** by `tests/gpu/webGpuParity.spec.ts`
([`FEAT-0439`](../features/FEAT-0439-webgpu-cross-path-parity.md)) against the JS path
on SwiftShader and on an Intel Gen-11 adapter, bit-identical on both. The four
series are pinned in that suite's `KNOWN_DISCREPANCIES`, each to its last divergent
candle.

## Cause

One class, three places: a stage starts before its input has a value.

- **`src/shaders/atr.wgsl`** takes `high[0] - low[0]` as the first true range, although
  candle 0 has no previous close, and writes the seed to `output[len - 1]`. The JS path
  settled this in [`BUG-0456`](BUG-0456-js-atr-first-true-range-zero.md): the first
  candle has no true range, so ATR(14) has its first value at candle 14.
- **`src/shaders/supertrend.wgsl`** runs its band recursion from candle 0. Before the ATR
  is seeded `atr_data` is 0, so both bands collapse onto `hl2` and the ratchet carries
  that into the first real candle. It also inherits the ATR seed above. The JS path
  seeds the bands from the first ATR value ([`BUG-0458`](BUG-0458-js-supertrend-never-has-a-value.md)).
- **`WebGpuCalculator.calculateMacd`** runs the signal EMA over the whole MACD line.
  Before the slow EMA exists the line is 0, and between the fast and the slow seed it is
  the bare fast EMA — a price. The EMA shader seeds its SMA over those values. The JS
  path starts the signal at the first MACD value
  ([`BUG-0430`](BUG-0430-macd-seeding-mismatch.md) is the WASM twin of this).

## Fix

Take the JS path as the specification — it is the one the evaluator reads — and start
each stage at the first candle its input has a value:

- `atr.wgsl`: no true range for candle 0; seed over candles 1..len, write it at `len`.
- `supertrend.wgsl`: leave the output unset until the ATR's first value and seed the
  bands there.
- `calculateMacd`: run the signal EMA over `macdLine.subarray(slowLength - 1)` and pad
  the front, rather than over the whole line.

Then delete the four entries from `KNOWN_DISCREPANCIES`; the suite fails until they are
gone, which is the check that the fix landed.

## Acceptance criteria

- [x] `npm run test:gpu` passes with `ATR(14)`, `SuperTrend(10,3)`, `MACD signal` and
      `MACD histogram` removed from `KNOWN_DISCREPANCIES` — the table is empty, 5/5 on
      SwiftShader and on Intel Gen-11
- [x] The ATR's and the SuperTrend's first GPU value sits at the same candle as the JS
      path's, rather than one candle early — asserted by the new `STARTS_WITH_JS` test,
      which also covers the MACD signal
- [x] No other case in the suite moves past its bound

## Fixed (2026-09-15)

As specified above, with two details the spec did not settle:

- **`calculateSuperTrend` takes the ATR length, not the data length**, as its last
  argument, and passes it to the shader as `seed`. The shader cannot find the seed by
  looking for the first non-zero ATR — a flat stretch has an ATR of exactly 0 — and the
  data length was already `close.length`.
- **The signal starts at `max(fast, slow) - 1`**, not `slowLength - 1`, so a caller
  that swaps fast and slow does not start it early either.

**The bound alone would not have caught a regression here.** It compares only candles
where JS has a value, so a GPU seed one candle early is invisible once it decays. The
suite now also asserts that ATR(14), SuperTrend(10,3) and the MACD signal have their
first non-zero GPU value on the JS path's first candle. Before the fix it read 13 vs 14,
0 vs 10 and 11 vs 33.

**Found on the way: an Intel Vulkan driver miscompile.** The first rewrite of the trend
flip updated `trend` in one `if` and chose the band from `trend` in a second `if` in the
same loop iteration. SwiftShader ran it correctly. Intel Gen-11 wrote `trend = -1` but
the up-trend's band on every flip candle — 26 candles beyond the bound, the first at
candle 22, by 579. The flip is now decided once into `bull` and both outputs are
`select`ed from it. The two adapters are no longer bit-identical in the ATR's last
digits, but both are inside the bound, so a real adapter is worth the extra run
(`CACHY_GPU_VULKAN=1`) whenever a shader's control flow changes.

## Out of scope

- The warmup placeholders the GPU path writes where JS has no value (`50` for the raw
  stochastic, `0` elsewhere). `calculate()` reads only the newest candle, so they reach
  the chart only for a series shorter than the indicator's period.

## Links

- [`FEAT-0439`](../features/FEAT-0439-webgpu-cross-path-parity.md) — the suite that found it
- `tests/gpu/webGpuParity.spec.ts` — `KNOWN_DISCREPANCIES`
- `src/shaders/atr.wgsl`, `src/shaders/supertrend.wgsl`
- `src/services/webGpuCalculator.ts` — `calculateMacd`
