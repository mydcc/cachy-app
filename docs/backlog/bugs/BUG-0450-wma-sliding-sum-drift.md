---
id: BUG-0450
title: The JavaScript WMA drifts from the exact value in proportion to series length
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
branch: fix/bug-0450-sliding-sum-drift
start_date: 2026-09-13
---

# BUG-0450 — The JavaScript WMA drifts from the exact value in proportion to series length

## Symptom

`JSIndicators.wma` — the normative alert path for WMA and HMA alerts, and the chart's
WMA and HMA lines — moves away from the exact weighted average the longer the series
is. At BTC scale, against the WASM core's exact decimal result:

| candle | WMA(10) | HMA(20) |
|---|---|---|
| 40 | 6.5e-11 | 1.4e-10 |
| 200 | 3.6e-10 | 2.0e-9 |
| 399 | 6.3e-10 | 4.6e-9 |

and 2.9e-8 for WMA(10) over 5000 candles against a from-scratch window sum.

Honest scale: at a 50,000 price that is a relative error around 1e-12, and no alert is
known to have fired or stayed quiet because of it. It is P3. It is still a defect,
because it is *unbounded* — nothing about it stops at one window's arithmetic — and
because it made WMA and HMA fail the cross-path parity bound that exists to catch
structural divergence.

## Evidence

**Demonstrated.** Found when FEAT-0446 added HMA(20) to `crossPathParity.test.ts`: worst
4.577e-9 at the last candle, identical for 40, 120 and 250 candles of seeding — so not a
seeding gap. A per-candle probe showed the difference growing monotonically with index.

`indicators_precision.test.ts` reproduces it without WASM: WMA(10/20/50) over 5000
candles against a per-window recomputation failed at 2.9e-8, 1.9e-8 and 1.7e-9 before
the fix.

## Cause

The sliding update is O(1):

```ts
wmaSum = wmaSum + period * addVal - sum;
sum = sum - dropVal + addVal;
```

`sum`'s rounding error is subtracted into `wmaSum` on every step and never removed, so
the two errors compound. `sma` and `vwma` use the same running-sum shape but only add
and remove the *same* values, so their errors largely cancel; they stay under the bound
at 5000 candles and are pinned by the same test.

## Fix

Resynchronise `sum` and `wmaSum` from the window itself once per period. That is one
O(period) recomputation every `period` steps, so the loop stays O(n) and the error stays
at one window's worth wherever in the series it is.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix
- [x] The test passes with the fix
- [x] The same bound is asserted for `sma` and `vwma`, so a future drift in either fails

## Links

- `src/utils/indicators.ts` — `wma`
- `src/utils/indicators_precision.test.ts` — the drift test
- [`FEAT-0446`](../features/FEAT-0446-recorded-history-remaining-indicators.md) — the parity extension that surfaced it
