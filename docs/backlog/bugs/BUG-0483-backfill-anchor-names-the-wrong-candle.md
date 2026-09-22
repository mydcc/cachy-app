---
id: BUG-0483
title: After a multi-candle backfill a firing is stamped with the wrong candle and crossings inside the gap are lost
type: bug
status: in-progress
assignee: opencode
branch: fix/bug-0483-anchor-stamp
priority: P1
milestone: none
editions: [community, pro, private]
area: alerts
data_class: none
adr: none
depends_on: []
---

# BUG-0483 — After a multi-candle backfill a firing is stamped with the wrong candle and crossings inside the gap are lost

## Symptom

The tab sleeps, the network drops, or the trader switches symbol and back. The store
refills the series with several candles at once. Then:

1. An alert that fires is announced against a candle that is not the candle it fired on —
   the timestamp can be hours off, and everything keyed on it is keyed wrong.
2. A bot that fires on that close submits nothing and reports `no-entry-price`.
3. A crossing that happened inside the gap is never detected and never announced.

The trader sees an alarm referring to the wrong bar, or no alarm at all, with no
indication that anything was skipped.

## Evidence

**Derived**, and the code documents half of it already.

`src/services/alertEngine/ruleEvaluationLoop.ts` — `advance()` returns the high-water
open time *from before* the batch:

```ts
if (previous === undefined || highest <= previous) return undefined;
return previous;
```

The evaluation that follows does **not** use a snapshot at `previous`. `candlesFor` calls
`readCandles`, whose contract (`readClosedCandles` in `ruleLoopWiring.ts`) is "the current
full closed history". So on a batch that jumps from candle *n* to candle *n+5*:

- `anchorMs` = open time of candle *n*
- the data evaluated = history ending at candle *n+4*

The verdict is computed on the newest data, and stamped with an anchor five candles old.
That anchor is then carried into `RuleFiring.anchorMs` and from there into:

- `alertNotificationKey(rule.id, anchorMs)` — the duplicate-suppression key
- `recordRuleFiring(rule.id, anchorMs)` — `RuleState.last_fired_anchor_ms`, which the core
  uses for `once_per_candle_close`; a stale value lets the same rule announce a second
  time on the real candle
- `shadowLedger` rows, which claim to say "which candle the verdict belongs to"
- `closeAtAnchor(symbol, timeframe, anchorMs)` in `botOrders.ts`, which looks the candle
  up **by open time**. Candle *n* is usually still in the buffer, so a bot sizes its entry
  from a five-candle-old close — or, once *n* has been trimmed, finds nothing and returns
  `no-entry-price`.

The loop's own docstring calls the skipped candles a "Known limit, not fixed here" and
argues they would produce "identical verdicts, consuming extra gate-dedup slots for no
new information". That argument holds for a stateless `compare`. It does not hold for
`cross`: a cross is decided from the previous and current candle of the series, so a
crossing that occurred between *n+1* and *n+2* is simply not present in the comparison
made at *n+4*. The same applies to `percent_change` with a short `lookback` and to
`window`. The comment's conclusion is right that reporting intermediate anchors alone
would not recover them — but the premise it rests on ("identical verdicts") is wrong, and
that matters for how the fix is scoped.

## Cause

`advance()` reports an anchor from before the batch while `CandleReader` answers with
history from after it. The two were consistent when candles arrived one at a time, which
is the only case the close detector was designed against.

## Fix

Two separable pieces; the first is small and closes the visible damage.

1. **Stamp the anchor that was actually evaluated.** Report the open time of the last
   *closed* candle in the batch, not the pre-batch high-water mark, so `anchorMs` and the
   data agree. This alone fixes the wrong timestamp, the wrong `last_fired_anchor_ms`, and
   the bot's `no-entry-price`.
2. **Decide what a gap owes the trader.** Either evaluate each skipped close against a
   history truncated to that anchor — which needs `CandleReader` to answer "as of this
   anchor", the larger change the docstring names — or detect the gap and report it
   through the existing unevaluable channel so a missed crossing is visible rather than
   silent. Choosing between them is an open question, not a detail.

Leave alone: the monotonic guard in `ruleEvaluationGate.evaluate`. It is what stops a
replayed candle re-firing, and it stays correct under either fix.

## Acceptance criteria

- [ ] A test feeds one batch spanning five candles and asserts the firing's `anchorMs` is
      the last closed candle in that batch — failing before the fix
- [ ] A test asserts `closeAtAnchor` resolves the entry price for a bot firing produced by
      such a batch
- [ ] A test asserts `RuleState.last_fired_anchor_ms` after a gap equals the candle that
      was evaluated, so `once_per_candle_close` cannot announce twice for it
- [ ] A cross that occurs strictly inside a gap is either evaluated or reported as skipped;
      it is not silently dropped
- [ ] The loop's docstring no longer claims the skipped closes would produce identical
      verdicts

## Links

- `src/services/alertEngine/ruleEvaluationLoop.ts` — `advance`, `observeCandles`, `evaluateSeries`
- `src/services/alertEngine/ruleLoopWiring.ts` — `readClosedCandles`
- `src/services/alertEngine/botOrders.ts` — `closeAtAnchor`
- `src/lib/rules/ruleEvaluationGate.ts` — the monotonic guard this must not break
- [`BUG-0441`](BUG-0441-legacy-alert-cold-baseline-never-fires.md) — the same failure class on the retired engine
