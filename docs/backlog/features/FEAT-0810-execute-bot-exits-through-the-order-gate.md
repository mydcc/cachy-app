---
id: FEAT-0810
title: Execute bot exits through the order gate
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: required
depends_on: [FEAT-0806, FEAT-0809]
parent: FEAT-0805
size: L
estimate: 13
---

# FEAT-0810 — Execute bot exits through the order gate

## Problem

Even with exit conditions in the document (FEAT-0809), nothing evaluates them
against an open position, and nothing turns a triggered exit into a close. The
submission path refuses `reduce_only` with `reduce-only-unsupported`, so today
the only automated exit is the resting stop plan. A bot cannot take profit and
cannot react to the thesis it was built on.

This is the money-path item of the epic: it must close through the existing gate
and must never open exposure by accident.

## Proposal

An exit evaluator runs while a bot owns a position:

1. For each owned position, evaluate the owning bot's `exits` and
   `take_profit` on the same cadence as the trigger (candle close; intrabar is a
   decision, see Open questions).
2. On a firing, submit a **close** through `TradeService.closePosition` /
   `orderPlacementService`, with `reduce_only` set and the quantity derived from
   the position (all, or `fraction` of it), never from the rule's entry size.
3. Go through `OrderGate` exactly like a manual close. Risk limits apply; no
   privileged path, no broadened permissions.
4. Enforce ownership: only the bot that owns `(symbol, side)` may close it. A
   rule that does not own the position cannot close it.
5. Idempotency: one exit action per `(ruleId, anchor, positionId)`; a retry or a
   reload must not double-close. Partial closes record the closed fraction.
6. After a full close, the bot returns to `closed`; the journal entry completes
   with the existing reconciliation, and attribution from FEAT-0806 stays.
7. If the user closes manually or the stop fires, the bot observes "no owned
   position" and evaluates no exits. It does not re-open.
8. A refusal (gate, size, permissions) surfaces once per rule/reason and leaves
   the position open; the bot does not silently stop evaluating.

## Acceptance criteria

- [ ] A long bot with `exits: [{ when: RSI > 70, close: "all" }]` closes its
      position exactly once when the condition holds on a closed candle.
- [ ] The close is a `reduce_only` order that passes `OrderGate`; a test proves
      no open/exposure-increasing order is produced.
- [ ] A `close: "partial"` exit closes exactly `fraction` of the position; the
      remainder stays owned and can be closed by a later exit.
- [ ] A rule that does not own the position cannot close it, even if its
      conditions hold.
- [ ] Two evaluations of the same `(ruleId, anchor, positionId)` produce one
      close; a simulated reload mid-exit does not produce a second.
- [ ] A manual close and a stop-out both end the bot's exit evaluation without a
      re-entry.
- [ ] A gate refusal leaves the position open and reports the reason once.
- [ ] `take_profit` (if FEAT-0809 ships it) closes at the resolved distance from
      the actual entry, not from a stale price.
- [ ] Tests are money-path tests: decimal quantities, no native-number math.

## Out of scope

- Exit authoring UI (FEAT-0811).
- Trailing/break-even as dedicated fields; express them as exit conditions once
  the operands exist.
- Live execution (`send`); paper only.
- A portfolio kill switch; this item provides the close primitive, not the UI.
- Reopening a position after an exit; a bot that wants to re-enter does so on
  its entry conditions and its frequency policy, not as part of the exit.

## Open questions

- Whether exits evaluate intrabar as well as on candle close. Proposal: close
  first (consistent with the trigger), intrabar behind the rule's
  `evaluation_mode` once the semantics are settled. Tracked in
  [`TODO.md`](../../TODO.md#32-take-profit-and-exit-semantics).
- Whether a paused bot keeps evaluating exits. Proposal: yes.
- What happens when the owning rule is deleted while a position is open.
  Proposal: the position becomes unattributed and must be closed manually; the
  bot may not be deleted with an open position without an explicit warning.

## Links

- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md)
- [`FEAT-0806`](FEAT-0806-attribute-paper-trades-and-journal-entries-to-their-bot.md)
- [`FEAT-0809`](FEAT-0809-rule-exit-conditions-in-the-strategy-document.md)
- [`FEAT-0811`](FEAT-0811-superbot-editor-for-exit-conditions.md)
- Code: `src/services/alertEngine/botOrders.ts`,
  `src/services/trade/closePosition.ts`, `src/services/orderGate.ts`,
  `src/services/orderPlacementService.ts`
