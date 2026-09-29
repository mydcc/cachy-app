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
assignee: opencode
branch: fix/bug-0586-flash-close-session
---

# BUG-0586 — Flash close strips protection before the session guard refuses

## Symptom

When the dispatch-guard session check (BUG-0551, `eb359681`, 2026-09-26)
refuses a flash close, the position is left **open and unprotected** — its
TP/SL have already been cancelled — and the order list shows the close as
*unconfirmed* even though it provably never left the device.

This is the same failure as BUG-0331, whose title is "A refused flash close
leaves the position open with its stops cancelled", and which is marked `done`.
BUG-0551
added a new refusal source into the same window and reopened it.

## Evidence

**Derived** from `src/services/tradeService.ts`, read directly. The order of
operations in `flashClosePosition`:

    1432  orderGate.verifyOrThrow(this.completeIntent(intent));
    1434  // Past this line the function has side effects to undo on failure.
    1435  clientOrderId = candidateOrderId;
    1438  omsService.addOptimisticOrder({ …, _isOptimistic: true });
    1462  try { await this.cancelAllOrders(symbol, true, { action: "flash-close-position", confirmedAt }); }
    1471  const result = await this.gatedRequest(intent);

The `verifyOrThrow` at 1432 is the FEAT-0011 risk-limit verification, and its
own comment says it "moves the refusal to before the damage". It does — for
risk limits. But `cancelAllOrders` at 1462 is a **real, successful write**, and
it is the step that strips the position's protection. Only then does
`gatedRequest` at 1471 run, and that is where BUG-0551's `dispatchUnderSession`
/ `assertSessionIntact` guard fires (installed at 1471's call chain,
`tradeService.ts:495-498`, hook in `appAuth.ts:149` and `:163`).

So a session refusal — account switched, venue switched, or mode flipped
live→paper during the signature await — lands *after* the protection is gone.
Nothing was sent.

The rollback then misclassifies it. `isTerminalError` (1497-1518) is true for a
`BitunixApiError`, an `OrderRefusedError`, or anything matching 400/401/403 —
by message text, by `status`, or by `code === "VALIDATION_ERROR"`. An `OrderRefusedError`
from the session guard is neither and its message carries no such code, so the
optimistic order is **kept** and marked `order._isUnconfirmed = true`. The OMS
therefore shows a close that never happened.

## Cause

The pre-flight verification at 1432 covers the risk-limit refusals but not the
session refusals, which are decided later — inside the dispatch, after the
cancels. The two refusal families were added at different times to the same
function and the ordering argument was only ever made for one of them.

## Fix

Decide the intended semantics before implementing, because both answers are
defensible:

- **Check the session before the cancels.** Extend the pre-flight at 1432 to
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
      dispatch leaves the position open, and fails without the fix — **still
      open**, this is the ordering half and no fix has been chosen (see Open
      question)
- [ ] The test passes with the fix — **still open**, same reason
- [x] A refused flash close no longer leaves a `_isUnconfirmed` order behind
- [x] The existing BUG-0331 regression test still passes, and BUG-0331 is
      re-linked from this item rather than left silently `done`

The two met criteria are verified. `tradeService_flashClose_hardening.test.ts`
4/4, and the four surrounding close suites (`flashClose`, `hedgeClose`,
`closeSingleBitget`, `closeAllBitget`) 16/16. The first hardening test is the one
that matters — it was vacuous before this PR, because `getOrder` was mocked only
in the second test, so the indeterminate branch's `if (order)` was false,
`updateOrder` never ran, and the assertion held with or without the fix. With
the mock added it goes red when the fix is removed.

The two open criteria are the reason this item is still `specced`.

## Open question

This item stays `specced` on purpose: the second half needs a **product
decision** that an agent must not make alone. Both orderings are implementable
and each fails differently.

- **Cancel-then-close** (today's order). The stops are gone before the close
  goes out, so a resting stop cannot fight the market order. The cost: a
  session refusal discovered after the cancel leaves the position **open and
  unprotected**, with only a toast.
- **Close-then-cancel.** Closes that window. The cost: a stop placed in the
  gap can fill against the close, and in hedge mode that fill opens a **reverse
  position** rather than flattening one.

Closing an unprotected-position window by opening a possible unintended reverse
is a risk-appetite call, not a mechanical one. The first half of this item — a
refused flash close is terminal, so it no longer leaves a misleading
`_isUnconfirmed` order — is implemented and independent of this choice; the
item does not close until the second half is decided.

`docs/TODO.md` is where `docs/backlog/README.md` says an open decision belongs;
this section is the pointer, and the decision itself needs a human.

**Status: still `specced`, deliberately.** PR #3728 lands the ghost-order half
and nothing else. Two of the four acceptance criteria above stay unticked, so
this item must not be flipped to `done` and the issue it mirrors must not be
closed by that PR.

## Out of scope

- Changing the outcome of a genuine timeout or network error. Those really are
  unknown, and `_isUnconfirmed` is the honest state for them
- `closeAllPositions` and the paper-trading seam, unless the chosen ordering
  turns out to require it
- Any change to the OMS `removeOrder` / `updateOrder` contract itself

## Links

- BUG-0331 — the original item, marked `done`; this is the same failure through
  a refusal source added after it
- BUG-0551 — added the session guard that reopens it
