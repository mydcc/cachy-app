---
id: BUG-0331
title: A refused flash close leaves the position open with its stops cancelled
type: bug
status: done
assignee: claude
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
---

Branch: `fix/bug-0331-flash-close-strips-protection`

# BUG-0331 — A refused flash close leaves the position open with its stops cancelled

## Symptom

The trader presses flash close. The order is refused, so the position stays
open — but its stop-loss and take-profit are gone. They are now in a live
position with no protection, and nothing on screen says so.

This is strictly worse than the state they started in, and it happens at the
moment they were trying to get out.

## Cause

`TradeService.flashClosePosition` cancels the position's resting orders before
placing the close:

```
// HARDENING: Safety First. Attempt to cancel all open orders (SL/TP) before closing.
await this.cancelAllOrders(symbol, true);
```

The reasoning is sound — a resting stop can fight a market close — but it runs
*before* the order reaches the FEAT-0011 gate. Every refusal the gate can issue
therefore lands after the protection is already gone:

- the kill switch is engaged (FEAT-0013)
- a risk limit rejects the order (FEAT-0013)
- the payload disagrees with the displayed state (FEAT-0011)
- the account state is stale beyond `MAX_ACCOUNT_STATE_AGE_MS`
- the venue does not support the action (FEAT-0017)

The cancel is not rolled back on any of these paths. The optimistic-order
recovery below it restores the *order* view, not the cancelled stops.

FEAT-0330 closed the confirmation case specifically, by checking
`requiresConfirmation` before the cancel runs. That was a point fix for the one
refusal it introduced — every other refusal above still reaches the cancel.

## Expected

A flash close that will be refused cancels nothing. Either the whole intent is
verified before any side effect, or the cancelled orders are restored when the
close does not happen.

## Suggested fix

`orderGate.verify` is pure and side-effect free, so it can run early: build the
intent, verify it, and cancel the resting orders only once the verdict is
`approved`. The gate then runs a second time inside `gatedRequest`, which is
harmless — verify is documented as safe to call twice.

The alternative, restoring the cancelled stops on failure, is worse: it needs
the venue to accept a re-placement that may no longer be valid, and it waits to
find out while the position is unprotected.

## Notes

Found by `src/tests/flash-close.confirmation.test.ts` while wiring
[`FEAT-0330`](../features/FEAT-0330-flash-close-wiring.md). The test asserts
that a refused close sends nothing at all; before the point fix it caught an
`/api/orders` call that turned out to be the cancel.

The same shape may exist wherever a call site does preparatory work before
`gatedRequest`. Worth a sweep rather than assuming flash close is the only one.

## Fix

The intent is built and verified before the function does anything with a side
effect. `orderGate.verify` is pure and documented as safe to call twice, so the
early call costs nothing and cannot approve what the gate would refuse — it
only moves the refusal to before the damage. `gatedRequest` then submits the
*same* intent object rather than a second one built from the same inputs;
`completeIntent` was extracted so the check and the submission cannot disagree,
which is the class of bug the gate exists to catch in the first place.

`clientOrderId` is assigned only after the verdict. It is the catch block's
signal that an optimistic order needs rolling back, so setting it earlier would
send the recovery path chasing an order that was never added.

This supersedes the FEAT-0330 point fix, which asked `requiresConfirmation`
before the cancel. That covered one refusal; verifying covers all of them, so
the narrower helper is gone rather than left as a second, weaker way to ask the
same question.

## Verification

`src/tests/flash-close.confirmation.test.ts`:

- the kill switch refuses → nothing is cancelled
- the confirmation is missing → nothing is cancelled
- the close is going through → the stops *are* still cleared first, because the
  hardening itself is correct and had to survive the fix

## Sweep

The Notes below asked whether other call sites share the shape. A scan of every
`tradeService` method that reaches `gatedRequest`, looking for `cancelAllOrders`,
`addOptimisticOrder`, `removeOrder`, `updateOrder` or `updatePosition` before
that call, returns only `flashClosePosition`. That is a heuristic over method
bodies rather than a proof, but nothing else in this service prepares state
before the gate.
