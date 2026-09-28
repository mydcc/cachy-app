---
id: BUG-0586
title: A flash close that the new session guard refuses still leaves the position open with its stops cancelled
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
---

# BUG-0586 — Flash close strips protection before the session guard refuses

## Symptom

When the dispatch-guard session check (BUG-0551, `eb359681`, 2026-09-26)
refuses a flash close, the position is left **open and unprotected** — its
TP/SL have already been cancelled — and the order list shows the close as
*unconfirmed* even though it provably never left the device.

This is BUG-0331's exact title and symptom, which is marked `done`. BUG-0551
added a new refusal source into the same window and reopened it.

## Evidence

**Derived** from `src/services/tradeService.ts`, read directly. The order of
operations in `flashClosePosition`:

    1433  orderGate.verifyOrThrow(this.completeIntent(intent));
    1435  // Past this line the function has side effects to undo on failure.
    1436  clientOrderId = candidateOrderId;
    1438  omsService.addOptimisticOrder({ …, _isOptimistic: true });
    1462  try { await this.cancelAllOrders(symbol, true, { action: "flash-close-position", confirmedAt }); }
    1471  const result = await this.gatedRequest(intent);

The `verifyOrThrow` at 1433 is the FEAT-0011 risk-limit verification, and its
own comment says it "moves the refusal to before the damage". It does — for
risk limits. But `cancelAllOrders` at 1462 is a **real, successful write**, and
it is the step that strips the position's protection. Only then does
`gatedRequest` at 1471 run, and that is where BUG-0551's `dispatchUnderSession`
/ `assertSessionIntact` guard fires (installed at 1471's call chain,
`tradeService.ts:495-498`, hook in `appAuth.ts:149` and `:163`).

So a session refusal — account switched, venue switched, or mode flipped
live→paper during the signature await — lands *after* the protection is gone.
Nothing was sent.

The rollback then misclassifies it. `isTerminalError` (1497-1518) is true only
for `BitunixApiError` or a message containing 400/401/403. An `OrderRefusedError`
from the session guard is neither and its message carries no such code, so the
optimistic order is **kept** and marked `order._isUnconfirmed = true`. The OMS
therefore shows a close that never happened.

## Cause

The pre-flight verification at 1433 covers the risk-limit refusals but not the
session refusals, which are decided later — inside the dispatch, after the
cancels. The two refusal families were added at different times to the same
function and the ordering argument was only ever made for one of them.

## Fix

Decide the intended semantics before implementing, because both answers are
defensible:

- **Check the session before the cancels.** Extend the pre-flight at 1433 to
  assert the dispatch session is still intact, so a moved session never reaches
  the cancel. This is the smaller change and matches the existing comment's
  intent.
- **Or reorder**: dispatch the close first and cancel only on success.

Either way, the optimistic-order rollback must recognise a session refusal as
*terminal*. An order that provably never left the device must not be parked as
`_isUnconfirmed` — that state is for genuine timeouts and network errors, and
mixing the two is what makes the OMS lie.

Re-check whether the same shape exists in `closePosition` and
`closeAllPositions`, which BUG-0331 may have covered and this path may not.

## Acceptance criteria

- [ ] A test reproduces the defect: a session change between the cancel and the
      dispatch leaves the position open, and fails without the fix
- [ ] The test passes with the fix
- [ ] A refused flash close no longer leaves a `_isUnconfirmed` order behind
- [ ] The existing BUG-0331 regression test still passes, and BUG-0331 is
      re-linked from this item rather than left silently `done`

## Links

- BUG-0331 — the original item, marked `done`; this is the same failure through
  a refusal source added after it
- BUG-0551 — added the session guard that reopens it
