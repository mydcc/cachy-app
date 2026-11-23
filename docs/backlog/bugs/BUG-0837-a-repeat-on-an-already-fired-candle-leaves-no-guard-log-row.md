---
id: BUG-0837
title: A repeat on an already-fired candle leaves no guard log row
type: bug
status: dropped
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

Known, and recorded in FEAT-0822's own criterion note: the within-candle
suppression happens in the evaluation gate's announce map (FEAT-0477). A
repeat the gate withholds never reaches the order lane, so it never reaches
`recordBotGuard` either. The gate is store-free by design and has no
notification channel toward the guard ledger. FEAT-0822 shipped the
suppression and deferred the log row, but left its criterion unticked
rather than amended, which is why this reads as a defect.

## Fix direction

An owner decision, because both options are clean and they differ in scope:

1. **Row wanted:** give the gate an optional suppression port (the shape
   `vetoSuppressionSink` already has for vetoes) that the store wires to
   `recordBotGuard`. The core stays store-free because the port is
   injected. Before that, decide whether a replay after a reload counts as
   a suppression. Proposal: it does not. A reload replay is the engine
   catching up, not the bot declining to act, and counting it would add a
   row the trader did nothing to cause. Start with the failing test:
   evaluate one closed candle twice and read the guard log.
2. **Repeat stays silent:** amend FEAT-0822's criterion to drop the
   guard-log half and tick it.

Recommendation: option 2. The guard log answers "why did my bot not act",
and on the same candle the bot already acted. A row there tells the trader
nothing new.

## Resolution (2026-11-23)

Dropped by owner decision: option 2. The same-candle repeat stays silent,
and FEAT-0822's criterion is amended to say so. No suppression port is added
to the gate. The guard log keeps answering "why did my bot not act", and on
a candle where the bot already acted that question does not arise.

## Links

- [`FEAT-0822`](../features/FEAT-0822-bot-firing-policy-and-guards.md)
- [`FEAT-0805`](../features/FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
