---
id: BUG-0464
title: The condition test oracles define a cross differently from the core
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: none
adr: none
depends_on: []
assignee: claude-code
branch: fix/bug-0464-oracle-cross-ties
start_date: 2026-09-13
---

# BUG-0464 — The condition test oracles define a cross differently from the core

## Symptom

Two suites prove the evaluator's crosses against an oracle that re-derives each verdict
independently:

- `recordedHistoryConditions.test.ts` (FEAT-0438)
- `indicatorConditions.integration.test.ts` (FEAT-0028)

Both oracles used another definition of a cross than the core they check. The two only
disagree when a value lands **exactly** on the level:

| | before the candle | on the candle | a touch from below counts as crossing above |
|---|---|---|---|
| core, `evaluate.rs` `Condition::Cross` | strict (`<`) | inclusive (`>=`) | yes |
| both oracles (TradingView's `ta.crossover`) | inclusive (`<=`) | strict (`>`) | no |

No condition over the fixtures ever put a value exactly on its level, so every expectation
passed and every flip literal is right. The suites nevertheless did not prove what the
core does on a tie.

## Evidence

**Demonstrated.** Found wiring Ichimoku into the alert path (FEAT-0446 group 4). Its
conversion and base lines are midpoints of windows that often share their extremes, so
they are exactly equal on 44 of 974 candles of the recorded BTCUSDT 1h fixture. On those
candles the evaluator and the oracle disagreed about "conversion crossing above base" 16
times.

Measured on that fixture for the TK cross:

- the core fires 26 times, the TradingView convention 28 times
- 7 firings are the core's only, 9 are the TradingView convention's only
- one core firing (candle 228) is a touch from below that falls back without going above

The close never equals any indicator wired so far.

## Decided (2026-09-13)

**The core's convention stays, and the oracles follow it.** Price alerts migrated from
FEAT-0027 fire on reaching a level (`price_reached` is a cross in either direction), and the
core keeps that on purpose so they fire exactly as they did. Changing it would change when
existing alerts fire on a tie. The difference from TradingView is documented rather than
removed.

## Fix

- `src/services/__fixtures__/crossedLikeTheCore.ts`: one definition of a cross for the
  oracles, strict before and inclusive on the candle, taking the sign of `left − right` so
  the `Decimal` oracle and the number oracle share it.
- Both oracles call it.
- `src/services/alertEngine/crossSemantics.integration.test.ts` checks the definition against
  the real evaluator. Closes touch, sit on and leave a level from both sides, and both
  directions are checked at every candle.

## Tests

- *a cross that lands exactly on the level* (above and below): green with the core's
  definition. With the old oracle definition put back into `crossedLikeTheCore` it fails on
  12 candles: the evaluator fires at 99 → 100 and 101 → 100, and does not at 100 → 101 and
  100 → 99.
- `recordedHistoryConditions.test.ts` and `indicatorConditions.integration.test.ts`: green,
  with no literal changed.
