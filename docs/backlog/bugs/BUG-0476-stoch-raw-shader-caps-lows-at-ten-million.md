---
id: BUG-0476
title: The raw stochastic shader cannot see a low above 10,000,000
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: C
adr: none
depends_on: []
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

- [ ] A parity case in `tests/gpu/parityCases.ts` over the recorded fixture scaled above
      10,000,000 fails before the fix and passes after it
- [ ] `npm run test:gpu` passes

## Links

- `src/shaders/stoch_raw.wgsl`
- [`FEAT-0439`](../features/FEAT-0439-webgpu-cross-path-parity.md)
