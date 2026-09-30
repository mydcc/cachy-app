---
id: BUG-0588
title: A load-bearing comment justifies a money-path classification with a partial-fill premise neither venue exhibits
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: docs/bug-0588-previous-quantity-comment
---

# BUG-0588 — Stale-low `previousQuantity` skips the daily-loss limit

> **Corrected 2026-09-28 during implementation. The defect described below does
> not occur on either supported venue, and no code change should be made for
> it.** The original evidence was derived from two code comments rather than
> from the venue payloads, and the payloads contradict it. What survives is
> much smaller: one comment that asserts something unverified. That is the
> whole item now — see "What actually survives".

## Original claim, and why it does not hold

The claim was that a partially filled order makes `previousQuantity` read
*stale-low*, so a real increase is misclassified as a shrink and
`checkDailyLoss()` is skipped.

`previousQuantity` comes from `liveOrder.amount`
(`tradeService.ts:2538-2561`, the assignment itself at 2561), and `isQuantityIncreasingModify`
(`rmsService.ts:635-643`) trusts any finite, positive value. The argument was
that a partial fill lowers the resting size.

It does not. For a partially filled order both venues report the order's
**original total** in `amount`, with the executed portion reported separately:

- `src/utils/server/venues/bitunix.ts:189-190` — `amount: o.qty`,
  `filled: o.tradeQty`
- `src/utils/server/venues/bitget.ts:130-131` — `amount: o.size`,
  `filled: o.filledQty`

and the repo's own API mirror shows a half-filled order with the total intact
(`docs/bitunix-api/07_trade.md:331`):

    {"orderId":"11111","qty":"1","tradeQty":"0.5", …}

`qty` stays `1`; `tradeQty` is the `0.5` that filled. So `previousQuantity` is
the pre-amendment total either way, and the misclassification cannot arise from
a partial fill.

## The planned fix was also wrong

The item's preferred direction was "derive the baseline from fill + rest". With
`amount` already the total, `amount + filled` would **double-count** the filled
portion and push the baseline above the real order size — making the gate treat
genuine increases as shrinks *more* often than before. It was not applied.

## What actually survives

One thing, and it is documentation rather than behaviour:

`tradeService.ts:2530-2536` argues the stale-`previousQuantity` residual is
minimal:

    // The live read itself races the gate by construction — one synchronous
    // round trip, no user action in between — so the window is minimal by
    // design. A partial fill landing inside it leaves a stale
    // previousQuantity; a stale-high reading fails toward the increase path,
    // so the residual is minimal by construction rather than by locking.

The first sentence is a design argument and stands. The second is now known to
be **wrong in its premise**: a partial fill does not leave a stale
`previousQuantity`, because `amount` is the total on both venues. The
conclusion (stale-high fails safe) still holds, but it is being reached through
a mechanism that does not exist.

A comment that reasons from a false premise is how the next reader repeats the
error, and this one is load-bearing for a money-path classification. It is also
exactly the class of claim BUG-0579 / BUG-0580 / BUG-0581 were filed for:
asserted about a venue wire format without checking the format.

## Fix

Rewrite the comment to state what is actually true:

- `previousQuantity` is the order's total size as the venue reports it, and both
  supported venues keep that total across a partial fill (`qty` / `size`, with
  `tradeQty` / `filledQty` reported separately)
- `isQuantityIncreasingModify` therefore compares against the pre-amendment
  total, and a partial fill does not move it
- the residual that remains is a genuine race on the single live read, and the
  existing fail-closed handling (`undefined`, `null`, `NaN`, infinite, zero and
  negative all route to the increase path) covers the corrupt cases
- name what is *not* verified: that both venues keep the total across a partial
  fill is read off the normalised payloads and the Bitunix mirror, and Bitget's
  wire format is already flagged unverified in BUG-0580

No behaviour change. Do not "harden" the baseline.

## Acceptance criteria

- [x] The comment no longer claims a partial fill makes `previousQuantity` stale
- [x] The rewritten comment cites `qty`/`size` vs `tradeQty`/`filledQty`, states
      the Bitunix half as verified, and puts the Bitget half in the
      not-verified paragraph alongside BUG-0580
- [x] `rmsService.isQuantityIncreasingModify` is **unchanged**, and the reason it
      is unchanged is written down where the next reader will look
- [x] No test is added: there is no behaviour to pin, and a test asserting the
      absence of a bug would be theatre

All four are met by PR #3729, which is comment-only — verified mechanically,
since a money path is involved. `tradeService` 200/200, ESLint and the decimal
audit clean.

The two criteria that are *not* ticks are the point of this item: the fix is a
comment, and the comment is the defect. `rmsService` was not touched, so there
is nothing to test and nothing that could be.

## Out of scope

- **No behaviour change of any kind.** The gate is correct as written
- **No hardening of the baseline.** `amount + filled` is named and rejected in
  the comment specifically so a later reader does not try it
- No test — see the last acceptance criterion
- No change to `isQuantityIncreasingModify` or to how `rmsService` treats
  corrupt `previousQuantity` values. Those were checked and are already
  fail-closed on `undefined`, `null`, `NaN`, infinite, zero and negative
- No work on the partially filled **order-detail** path or on fill tracking.
  BUG-0589 owns the Bitget `filled` field; this item does not

## Links

- BUG-0548 — introduced the `previousQuantity` comparison this builds on
- BUG-0567, BUG-0568 — the two fixes that widened the branch to be measured
- BUG-0580 — Bitget wire format already flagged unverified; the reason this
  item's premise could not be confirmed for Bitget from the mirror alone
- BUG-0589 — the concrete instance, found while correcting this item. The
  Bitget normaliser reads `filledQty`, which the mirror never documents. **These
  two are not independent confirmations:** BUG-0589 shows the Bitget wire format
  is unreconciled in a sibling field, so this item's remaining Bitget premise
  rests on exactly what BUG-0589 exists to settle
- `docs/bitunix-api/07_trade.md:331` — the half-filled example the correction
  rests on

