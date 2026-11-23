---
id: BUG-0837
title: A repeat on an already-fired candle leaves no guard log row
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# BUG-0837 — A repeat on an already-fired candle leaves no guard log row

## Symptom

FEAT-0822 promises that a bot with `once_per_candle` fires at most once per
closed candle and that "the suppressed repeat appears once in the guard log".
The first half holds. The second half has no trace in the tests or the code:
a repeat on a candle the bot already acted on is dropped without a guard row,
so the trader asking "why did my bot not act the second time?" gets no answer.

## Evidence

**Derived**, not demonstrated. Found while verifying the FEAT-0805 epic.

- `botGuardStore.test.ts` pins that a repeating reason is counted on one row
  (`limit-entries-day`), and `botGuards.test.ts` pins that `once_per_candle`
  adds no limit reason (`limitReasonsFor` returns `[]`).
- The `"duplicate"` branch in `src/stores/alerts.svelte.ts` belongs to veto
  records, and `recordBotGuard` is called only for limits, vetoes and discarded
  confirmation signals.

No test drives a second evaluation of the same anchor and reads the guard log.

## Cause

Unknown. The same-anchor dedupe sits in the evaluation ledger and has no
reporting port toward the guard store.

## Fix direction

First write the failing test: evaluate one closed candle twice and read the
guard log. If a row is wanted, decide whether a replay after a reload counts
as a suppression; otherwise amend FEAT-0822's criterion to say the repeat is
silent.

## Links

- [`FEAT-0822`](../features/FEAT-0822-bot-firing-policy-and-guards.md)
- [`FEAT-0805`](../features/FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
