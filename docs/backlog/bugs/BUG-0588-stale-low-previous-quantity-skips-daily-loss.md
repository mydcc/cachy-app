---
id: BUG-0588
title: A partially filled order's stale-low previousQuantity is read as a shrink, so the daily-loss limit is skipped
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0588 — Stale-low `previousQuantity` skips the daily-loss limit

## Symptom

Amend a **partially filled** order upward. The gate reads the new quantity
against the *remaining resting* size, concludes the amendment does not increase
exposure, and therefore runs the size and loss-per-trade checks but **not**
`checkDailyLoss()` — the one limit that stops scaling in after the day's loss
cap has been reached.

No user error is needed. It needs a partial fill, an amend, and a breached
daily-loss limit.

## Evidence

**Derived** — two pieces of code that disagree, both quoted.

`tradeService.modifyOrder` supplies the baseline at `tradeService.ts:2538-2560`:

    let liveAmount: Decimal | undefined;
    try { liveAmount = new Decimal(liveOrder.amount); } catch { liveAmount = undefined; }
    …
    displayed: { …, previousQuantity: liveAmount, … }

Its own comment reasons about the failure direction, and only one of them:

    // A partial fill
    // landing inside it leaves a stale previousQuantity; a stale-high
    // reading fails toward the increase path, so the residual is
    // minimal by construction rather than by locking.

`rmsService.isQuantityIncreasingModify` (`rmsService.ts:635-643`) trusts any
finite, positive `previousQuantity`:

    const previous = intent.displayed.previousQuantity;
    if (previous === undefined || previous === null || !previous.isFinite() || !previous.gt(0)) return true;
    return newQty.gt(previous);

and `checkLimits` (`rmsService.ts:573-588`) routes on it:

    if (intent.kind === "modify") {
        if (!this.isQuantityIncreasingModify(intent)) {
            if (this.modifyQtyOf(intent) === null) return null;
            return this.checkPositionSize(intent) ?? this.checkLossPerTrade(intent);   // no checkDailyLoss
        }
        return ( this.checkDailyLoss() ?? this.checkPositionSize(intent) ?? this.checkLossPerTrade(intent) );
    }

The gap: a partial fill makes `liveOrder.amount` — the **resting** size —
**smaller** than the order's pre-amendment size. That is a *stale-low* reading,
and stale-low is the direction the comment never considered. It is also the
direction that is dangerous: it makes a real increase look like a shrink.

The function is otherwise careful — `undefined`, `null`, `NaN`, infinite, zero
and negative all fail closed to the increase path. Only a plausible, finite,
positive, *wrong* value slips through, and a partially filled order produces
exactly that.

## Cause

The baseline for "did this amendment enlarge exposure" is read from the venue's
current resting size, which moves for reasons other than the amendment. The
fail-closed reasoning covers corrupt values but not *valid* values that are
merely outdated in the unfavourable direction.

## Fix

Do not let a single live read carry the whole classification. Options, in
increasing order of work:

- **Cheapest and honest:** amend the comment's claim, and either close the
  stale-low direction or state in writing that it is knowingly accepted and
  what bounds it. Right now the comment asserts the residual is minimal, and
  this reading says it is not.
- **Run `checkDailyLoss()` on the non-growing branch too.** It needs no
  quantity and no price — it reads the day's loss from `riskState`. The
  asymmetry has no evident reason: an amendment that does not increase exposure
  is still a write, and a breached daily limit is breached either way.
- **Derive the baseline from something the amendment cannot move**, e.g. the
  filled amount plus the resting amount as of the order's creation, if the venue
  exposes it.

Prefer the second unless there is a product reason a non-increasing amendment
must stay possible after the daily cap — a trader must always be able to
*reduce*, and this branch is not the reduce path (`kind: "reduce"` returns
earlier), so reducing is unaffected.

## Acceptance criteria

- [ ] A test drives an amend of a partially filled order upward and shows
      `checkDailyLoss()` is not consulted; fails without the fix
- [ ] The test passes with the fix
- [ ] The `tradeService.ts:2530-2536` comment matches the code's actual
      behaviour, whichever direction is chosen
- [ ] The reduce/exit path is confirmed still unmeasured, so a breached daily
      limit can never trap a trader in a position

## Links

- BUG-0548 — introduced the `previousQuantity` comparison this builds on
- BUG-0567, BUG-0568 — the two fixes that widened this branch to be measured;
  they did not notice the daily-loss omission
