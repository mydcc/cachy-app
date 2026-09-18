---
id: BUG-0486
title: The evaluation gate's forget is never called, so its monotonic guard rests on a premise that is not true
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: none
adr: none
depends_on: []
---

# BUG-0486 — The evaluation gate's forget is never called, so its monotonic guard rests on a premise that is not true

## Symptom

No visible misbehaviour today. What is wrong is that a correctness argument in the code is
false, and three per-rule maps grow for the life of the session without ever being pruned.

This is filed because the argument is the thing protecting alerts from double-firing after
a reconnect, and an argument that names a mechanism which does not exist will not survive
the next change to that area.

## Evidence

**Derived.**

`src/lib/rules/ruleEvaluationGate.ts` justifies refusing any anchor at or before the last
one decided:

> Monotonic makes the whole class impossible rather than making one path careful, and costs
> nothing: a rule that legitimately needs to decide an anchor again is edited or disarmed,
> and **both call `forget`**.

`RuleEvaluationGate.forget` has no production caller. `armRule`, `removeRule` and
`disarmRule` (`src/services/alertEngine/armRule.ts`) do not call it; neither does the panel,
the loop, nor `initAlertEngine`. The only references to `ruleEvaluationGate` outside its own
module are the two `evaluate` calls in `ruleEvaluationLoop.ts`.

Consequences, in order of how much they matter:

1. The "costs nothing" claim is unpaid. Nothing can make a rule decidable again at an anchor
   it has already seen, so the escape hatch the design assumes is not reachable.
2. `lastEvaluatedAnchorMs`, `lastIntrabarAnchorMs` and `lastIntrabarFiredAnchorMs` retain an
   entry per rule id forever, deleted rules included. Small, but unbounded in session length.
3. A rule edited to a *coarser* trigger timeframe can have its next real close fall at or
   below the anchor recorded under the previous timeframe, and be withheld for one period
   with no indication. Not yet demonstrated; it is the shape the guard's own comment
   anticipated and delegated to `forget`.

## Cause

`forget` shipped with the gate in FEAT-0387 as the intended escape hatch. The store writers
that were supposed to call it landed separately and never did.

## Fix

Call `forget(ruleId)` from `armRule`, `removeRule` and `disarmRule` — the three writers of
`cachy_rules_v1`. That makes the docstring true, prunes the maps, and gives an edited rule a
clean slate, which is what the comment already promises a reader.

If a caller is found that must *not* reset the anchors — re-arming a `once` rule the trader
wants held until the next genuine close — say so in the item and keep that path out; do not
change the guard.

## Acceptance criteria

- [ ] A test asserts the gate forgets a rule's three anchors when it is removed — failing
      before the fix
- [ ] A rule edited mid-session is decidable at the next close of its new trigger timeframe
- [ ] The monotonic refusal still holds for a replayed or corrected candle on an unedited rule
- [ ] No map retains an entry for a deleted rule

## Links

- `src/lib/rules/ruleEvaluationGate.ts` — `forget`, and the comment this item is about
- `src/services/alertEngine/armRule.ts` — the three writers
- [`BUG-0483`](BUG-0483-backfill-anchor-names-the-wrong-candle.md) — the other half of the anchor story
