---
id: BUG-0588
title: A load-bearing comment justifies a money-path classification with a partial-fill premise neither venue exhibits
type: bug
status: ready
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
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
(`tradeService.ts:2538-2560`), and `isQuantityIncreasingModify`
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

- [ ] The comment no longer claims a partial fill makes `previousQuantity` stale
- [ ] The rewritten comment cites `qty`/`size` vs `tradeQty`/`filledQty` and
      links BUG-0580 for the Bitget caveat
- [ ] `rmsService.isQuantityIncreasingModify` is **unchanged**, and the reason it
      is unchanged is written down where the next reader will look
- [ ] No test is added: there is no behaviour to pin, and a test asserting the
      absence of a bug would be theatre

## Links

- BUG-0548 — introduced the `previousQuantity` comparison this builds on
- BUG-0567, BUG-0568 — the two fixes that widened the branch to be measured
- BUG-0580 — Bitget wire format already flagged unverified; the reason this
  item's premise could not be confirmed for Bitget from the mirror alone
- `docs/bitunix-api/07_trade.md:331` — the half-filled example the correction
  rests on

