---
id: BUG-0568
title: Quantity shrink with pumped price escapes the size caps without a loss limit
type: bug
status: done
assignee: opencode
branch: fix/bug-0568
priority: P2
shipped: unreleased
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: [BUG-0567]
---

# BUG-0568 — Quantity shrink with pumped price escapes the size caps without a loss limit

Follow-up to the BUG-0567 review (PR #3673, MEDIUM finding).

## Symptom

A pending-order amendment from 1.0 BTC at 50 000 to 0.9 at 500 000 is a
"shrink" by quantity (0.9 < 1.0) but carries 9x the notional. The BUG-0567
shrink path runs only `checkLossPerTrade`, which returns `null` immediately
when no loss limit is configured — so the amendment passes with neither a
size nor a loss measurement.

## Evidence

**Derived** — `src/services/rmsService.ts` `checkLimits`, modify branch:
the shrink path calls `this.checkLossPerTrade(intent)` only, and
`checkLossPerTrade` returns `null` as its first statement when
`maxLossPerTradeUsdt` is unconfigured. `checkPositionSize` (via
`notionalOf`, which already handles the modify kind) never runs there.

## Cause

The modify exemption is quantity-shaped: BUG-0548 gated the whole branch on
quantity growth, BUG-0567 decoupled the loss measurement from it, but the
size caps are still coupled to quantity growth. Price is the other half of
notional and is unbounded on the shrink path.

## Fix

Run `checkPositionSize` on the shrink path too. The modify branch's exemption
becomes: price-only and TP/SL-only amendments stay fully exempt, a *growing*
amendment faces the daily loss limit, the size caps and the loss ceiling, and a
*non-growing* amendment — a shrink, but equally a same-size amendment — faces
the size caps and the loss ceiling but not the daily loss limit.

The same-size case is not a rounding detail. `isQuantityIncreasingModify` is a
strict `gt`, so an amendment that leaves the quantity exactly as it rests lands
on the non-growing side and is now measured: 0.9 BTC at 50 000 amended to 0.9
BTC at 500 000 carries 10x the notional and is the purest form of the attack,
the one a quantity-only reading of "shrink" misses. It also means the app's real
price-change path is measured, because `modifyOrder` falls back to the resting
size when the request states no quantity.

The size cap is evaluated first, as on every other measured path, so a shrink
that breaches both caps reports `maxPositionSize`; a `maxLossPerTrade` refusal on
a non-growing amend is now reachable only when the size caps pass. This is a
real change in which field such a trader is shown, and it is pinned by a test.

`notionalOf` measures a modify as `modifyQuantity × price`, so a shrink at a
sane price makes the notional smaller and the cap does not fire. It fires only
when the quantity fell while the price rose far enough that the amended order
is still bigger than what the trader approved — which is the defect.

### The price-deviation alternative is not reachable

Bounding the price a shrink may carry was considered and rejected. The `modify`
intent carries `previousQuantity`, `modifyQuantity` and the *new* price, and
nothing else: there is no resting-order price to deviate from. A deviation
bound therefore needs a new field whose source sits outside the gate — the
venue (excluded under `Out of scope`) or a mark price, and a mark is
manipulable, which makes that bound weaker than the cap rather than stronger.

### What this costs, on purpose

The cap is a statement about the resulting position, while a modify measures
only the amended slice of it. A position that drifted over the cap through
price alone — 5 BTC opened at 20 000 against a 100 000 cap, BTC later at
25 000 — can then no longer be trimmed by a small step: 4.9 × 25 000 is
122 500, over the cap and refused, while 3.9 clears it. The gate refuses a
small reduction and permits a large one.

That is the deliberate price of closing the hole with the data the gate has.
The alternative — exempting a shrink whose *un-shrunk* order was already over
the cap — needs the same missing baseline, and its only available proxy
(`previousQuantity × the new price`) re-opens the attack: a 1 → 0.9 shrink at a
pumped price has a proxy notional above any sane cap, so the exemption would
pass exactly the amendment this item exists to refuse.

## What shipped

`checkPositionSize` now runs on the shrink path, next to the loss ceiling that
BUG-0567 put there. The one-line change is small; what it exposes is the reason
this item took a decision instead of a patch.

**The exemption was load-bearing in five tests, and three of them were passing
because nothing was measured.** `leaves an equal-quantity price change alone
inside the ceiling` sat under a 10 000 cap with a notional of 10 020 — and its
comment, which computed `0.2 × 600 = 120` against the *loss* ceiling, was
arithmetically right while describing the wrong limit entirely: the test's
subject under this item is the size cap, and it said nothing about the notional
at all. `leaves a shrinking amendment alone` ran against `everyLimitTight()`,
whose `maxPositionSizePercent` of 1 on a 1000 account is a 10 USDT cap that no
real account sets. `leaves an equal-quantity amendment alone inside the ceiling
(gt is strict)` documented a strict-inequality boundary that no assertion had
ever reached. None of that was sloppiness in the tests: the path they exercised
skipped the size caps entirely, so a test asserting "inside the ceiling" could
not fail no matter what the notional was. They are re-pointed at ceilings their
notionals fit inside, which is what they meant to say, and the strict boundary
is now genuinely exercised — flipping `gt` to `gte` fails it.

**A price-only amendment is not what the app sends.** `tradeService.modifyOrder`
falls back to the resting size when the request states no quantity, so the
app's real price-change path arrives at the gate as an *equal-quantity*
amendment — which is measured, not exempt. The full exemption only covers a
hand-built intent with no quantity anywhere, and the two tests that pin it
describe it as a safety property of the app, which it is not. That is why the
equal-quantity case is now tested end to end.

**The reproduction is mutation-checked.** Reverting the shrink path to
`checkLossPerTrade` alone fails exactly nine tests and nothing else in
`src/services` + `src/tests` (205 files, 2368 tests): the six new BUG-0568 cases,
the inverted BUG-0567 one, and the two new end-to-end cases in
`tradeService_modifyOrder.test.ts`.

**The percentage cap needed its own case.** The defect is equally reachable
through `maxPositionSizePercent`, and a test that only sets the absolute cap
would have left that path unpinned.

**Two asymmetries worth knowing, and neither is new policy.** The daily loss
limit and `checkOpenPositions` still skip a shrink, deliberately: the order
consumed its slot when it was first placed, and the day is the day. The kill
switch is the exception and always did apply — `increasesExposure` treats every
non-TP/SL amendment as exposure, so an engaged switch blocks a shrink too.

The second is a cost this change adds rather than inherits: a percentage cap
that cannot be measured (a corrupt account equity maps to `undefined`) now
refuses a shrink as unmeasurable, where before the path measured nothing and
let it through. That is the same refusal an enlargement already gets under
BUG-0508, so it is consistent and fail-closed — but it is a risk-reducing amend
refused for an unmeasurable cap, and it is now pinned by a test rather than
inherited by accident.

## Acceptance criteria

- [x] A test reproduces the defect (qty shrink with pumped price past the
  size cap, no loss limit configured) and fails without the fix
- [x] The test passes with the fix
- [x] Increasing, price-only and TP/SL-only modifies keep their exact
  behaviour — their BUG-0548 and BUG-0567 regression tests pass unmodified
- [x] The five tests that asserted the size-cap exemption on a *non-increasing*
  amend are re-pointed, because the exemption itself was the defect. Their
  acceptance criteria in BUG-0548 and BUG-0567 are untouched — those cover
  increasing, price-only and TP/SL-only amends:
  - `rmsService_riskLimits.test.ts` (BUG-0567) `leaves shrinking amendments
    exempt from the size caps` → inverted to `measures a shrinking amendment
    against the size caps`, plus a positive companion at a containing cap
  - `rmsService_riskLimits.test.ts` (BUG-0548) `leaves an equal-quantity price
    change alone inside the ceiling` → kept, ceiling raised to the 20 000 that
    its 10 020 notional actually fits inside
  - `rmsService_riskLimits.test.ts` (BUG-0548) `leaves a shrinking amendment
    alone` → `leaves a shrinking amendment alone when the caps contain it`
  - `rmsService_riskLimits.test.ts` (BUG-0548) `leaves an equal-quantity
    amendment alone inside the ceiling (gt is strict)` → kept, percentage cap
    dropped so the strict boundary is exercised at all
  - `tradeService_modifyOrder.test.ts` `approves a shrink against caps that
    would refuse an increase` → split into a refusal at a 1 USDT cap and an
    approval at a cap that contains the notional

## Out of scope

- Venue-side price sanity (the venue would hardly fill an absurd price;
  this is defense in depth at the gate).
- TP/SL-only amendments (never reach the modify branch).
- A resting-order price in the modify intent. That is the missing baseline for
  both a price-deviation bound and a shrink exemption for an already-oversized
  order; adding it is its own change, and it would have to establish where the
  baseline is trusted from.

## Links

- `src/services/rmsService.ts` (modify branch, `checkPositionSize`, `notionalOf`)
- BUG-0548 (quantity-shaped exemption), BUG-0567 (loss decoupled, size still coupled)
