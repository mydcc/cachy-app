---
id: BUG-0462
title: The panel's Parabolic SAR ignores its increment setting
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
assignee: claude-code
branch: fix/bug-0462-wasm-psar-increment
start_date: 2026-09-13
---

# BUG-0462 — The panel's Parabolic SAR ignores its increment setting

## Symptom

The Parabolic SAR card has three settings: start, increment and maximum. The WASM
Technicals calculator, the panel's default engine, read `start` for both the start and
the increment. The chart's line (`JSIndicators.psar`) reads all three. Wherever a trader
set start and increment apart, the panel showed another SAR than the chart.

Worst distance from the chart's line on the recorded fixture (1000 candles of BTCUSDT 1h),
the same at 40, 120 and 250 candles of seeding:

| start / increment / maximum | before | after |
|---|---|---|
| 0.02 / 0.02 / 0.2 (the default) | 2.9e-11 | 2.9e-11 |
| 0.01 / 0.02 / 0.2 | **3263** at candle 977 | ≤ 1e-9 |
| 0.02 / 0.01 / 0.2 | **3006** at candle 977 | ≤ 1e-9 |

A difference of 3263 at a BTC price near 77,000 is about 4 %, which is the distance of a
stop.

The default card has start and increment both at 0.02 and the indicator is off by
default, so only a trader who enabled it and changed one of the two saw this.

## Evidence

**Demonstrated.** Found probing JavaScript ↔ WASM parity for FEAT-0446 group 4, which puts
the Parabolic SAR on the alert path.

`technicals-wasm/src/lib.rs`:

- `initialize` built the state with `inc_af: s.start`, so `s.increment` was never read.
- `psar_step` took both factors from that one field: `let start = st.inc_af; let increment = st.inc_af;`.

The existing Rust replay test could not see it for two reasons. It set start and increment
to the same value, and its candles reverse the SAR on almost every candle, where the factor
has no effect.

## Fix

`PsarState` carries `start_af` and `inc_af` separately, and `psar_step` reads each from
its own field. The committed artefact in `static/wasm` is rebuilt.

## Tests

- `technicals-wasm/src/lib.rs` › `test_psar_reads_start_and_increment_separately`: the
  replay over 25 rising and 15 falling candles, with an update candle that continues the
  fall, for 0.01 / 0.02 and 0.02 / 0.01. Before the fix: 127.50 where the reference is
  118.47.
- `src/services/wasmIndicatorWindows.test.ts` › *Parabolic SAR in the panel against the
  chart's line*: the committed artefact against `JSIndicators.psar` over the recorded
  fixture, for the default and both split settings, within 1e-9 at every candle. Before the
  rebuild, both split settings failed from candle 40.
