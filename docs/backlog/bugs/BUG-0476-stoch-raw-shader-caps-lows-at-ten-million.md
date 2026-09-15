---
id: BUG-0476
title: The raw stochastic shader cannot see a low above 10,000,000
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: C
adr: none
depends_on: []
assignee: claude
start_date: 2026-09-15
branch: fix/bug-0476-stoch-raw-min-low
---

# BUG-0476 — The raw stochastic shader cannot see a low above 10,000,000

## Symptom

On the WebGPU engine, a symbol whose every low in the %K window is above 10,000,000
gets a stochastic %K computed against a lowest low of exactly 10,000,000. The value is
wrong, and it is wrong silently: it still lands between 0 and 100.

No USDT pair Cachy lists trades that high today, which is why nothing reports it. A
quote currency with a small unit — an index, a pair quoted in a weak fiat — would.

## Evidence

**Derived** from `src/shaders/stoch_raw.wgsl`:

```wgsl
var min_low: f32 = 10000000.0; // Init high
var max_high: f32 = 0.0;       // Init low
```

The running minimum starts at a constant rather than at the window's first low, so no
low above the constant can replace it. `max_high` starting at 0 has the mirror-image
problem only for negative prices, which do not occur.

Not caught by [`FEAT-0439`](../features/FEAT-0439-webgpu-cross-path-parity.md)'s parity
suite: its fixture tops out at 82,100.

## Fix

Initialise both extremes from the window's first candle (`high_data[id]`,
`low_data[id]`) and loop over the remaining `k_len - 1`.

## Acceptance criteria

- [x] A parity case in `tests/gpu/parityCases.ts` over the recorded fixture scaled above
      10,000,000 fails before the fix and passes after it — `Stochastic %K (price above
      10,000,000)` read 985 candles beyond the bound before, the first at candle 15
      (99.68 for 72.80)
- [x] `npm run test:gpu` passes — 23 cases, 5/5 on SwiftShader and on Intel Gen-11

## Fixed (2026-09-15)

As specified. The new case scales the fixture by 1024 rather than a round factor: a
power of two multiplies an `f32` exactly and leaves %K unchanged, so the case keeps the
unscaled Stochastic's rounding budget and tests the start value, not `f32` precision.
The fixture's lowest low is 62,268.3, so every scaled low sits above 63,000,000.

The siblings were checked for the same class: `williams_r.wgsl` and `choppiness.wgsl`
start their minimum at `1e38`, which no price reaches, and no other shader holds a
fixed extreme.

## Links

- `src/shaders/stoch_raw.wgsl`
- [`FEAT-0439`](../features/FEAT-0439-webgpu-cross-path-parity.md)
