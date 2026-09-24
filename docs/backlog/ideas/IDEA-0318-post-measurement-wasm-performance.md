---
id: IDEA-0318
title: Post-measurement WASM performance tuning
type: idea
status: done
shipped: 1.6.0-beta.197
priority: P3
milestone: none
editions: [community, pro, private]
area: calculation
data_class: none
adr: none
depends_on: [BUG-0317]
---

# IDEA-0318 — Post-measurement WASM performance tuning

Umbrella for improvements that should only be decided once BUG-0317 produced
real benchmark numbers:

- **Routing threshold (F-7):** auto-routing sends engines to `'ts'` below 1000
  candles while input is capped at `historyLimit ‖ 750`, so WASM is dormant by
  default. Decide whether to lower the threshold (>300?) once correctness is
  proven, or consciously park the module.
- **Boundary amortisation (F-9):** every `calculate()` re-marshals up to 4×N
  decimal strings, re-stringifies settings (WeakMap cache never hits) and
  replays full history O(N·indicators). The stateful `shift()` API already
  exists — initialize once per symbol/timeframe/settings-key and feed ticks.
  Keep decimal strings (precision decision BUG-0182 stands).
- **Numeric nits:** BB variance via E[x²]−E[x]² may lose accuracy near-flat
  bands (consider Welford over the ≤200 window if parity shows drift);
  SuperTrend re-parses `len` from the state key each call (store it next to
  multiplier).

This item was deliberately kept as an idea until benchmark numbers existed.
Those measurements landed in the implementation below; the original F-7/F-9/Welford
proposals are no longer open.
