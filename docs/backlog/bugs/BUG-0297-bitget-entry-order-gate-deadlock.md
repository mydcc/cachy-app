---
id: BUG-0297
title: An entry order on a venue that cannot attach TP/SL is refused by the gate whichever way it is built
type: bug
status: specced
priority: P1
milestone: M2
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0297 — An entry order on a venue that cannot attach TP/SL is refused by the gate whichever way it is built

## Symptom

On Bitget, placing an entry order from the calculator is refused before it
leaves the client. The trader sees the order rejected with "stopLoss is missing
from the order, so it could not be verified", having entered a stop.

There is no way to build an accepted entry on that venue: sending the stop and
not sending it are both refused, for different reasons.

## Evidence

**Derived**, from two pieces of code that disagree, plus a gate-level
reproduction added under FEAT-0017.

`orderPlacementService.placeEntryGroup` sets the displayed stop
unconditionally, but only puts one in the payload when the venue can carry it
— `src/services/orderPlacementService.ts:159` and `:164`:

```ts
stopLoss: attach && wantsStop ? { price: plan.stopLossPrice } : undefined,
displayed: {
    …
    stopLossPrice: plan.stopLossPrice,      // always
```

`attach` is `caps.tpSlAtEntry`, which Bitget declares `false`
(`src/services/exchange/bitgetCapabilities.ts`). So on Bitget the displayed
stop is always present and the payload stop never is.

`orderGate.checkPrices` refuses exactly that combination —
`src/services/orderGate.ts:854`:

```ts
if (expected === undefined) continue;   // displayed.stopLossPrice is NOT undefined
…
if (actual === null) { … return missing(field); }
```

Dropping the displayed stop does not help: the size rule re-derives quantity
from account size, risk and stop distance, and refuses with `qty.inputs`
missing when the stop is absent. Sending the stop in the payload anyway is now
refused as `tpSlAtEntry` unsupported (FEAT-0017). All three paths close.

Reproduction at gate level is in
`src/services/orderGate.capabilities.test.ts` → "refuses a Bitget entry for a
reason that is not the capability check", which asserts the refusal exists and
is *not* a capability refusal. That test documents the deadlock; it does not
fix it.

## Cause

The gate treats `displayed.stopLossPrice` as "a stop that must appear in this
payload". On a venue without attached protection the stop is real but belongs
to a *second* request, which the gate has no way to express — the displayed
state has one field for two different meanings: "the stop this order carries"
and "the stop this position will have".

`orderPlacementService` already knows the difference; it just has no field to
say so.

## Fix

Not settled — it changes money-safety logic and wants its own review, which is
why this is a separate item rather than a commit on FEAT-0017.

Sketch: give `DisplayedState` a way to distinguish a stop carried by *this*
payload from a stop the placement will attach in a follow-up request, so the
price rule compares only the former while the size rule keeps reading the
latter. `placeEntryGroup` already computes `attach` and can set it.

Leave alone: the size rule's use of the stop distance (it is correct — the
quantity really does derive from the intended stop), and the price rule's
refusal on a genuine mismatch.

## Acceptance criteria

- [ ] A test builds the entry `orderPlacementService` actually produces for a
      `tpSlAtEntry: false` venue and shows the gate refusing it
- [ ] That test passes with the fix, and the equivalent Bitunix entry is
      unaffected
- [ ] The gate still refuses a payload whose stop disagrees with the displayed
      stop, on both venues
- [ ] A stop that fails to arrive in the follow-up request is still reported as
      unprotected (`orderPlacementService`'s retry path is untouched)

## Links

- [`FEAT-0017`](../features/FEAT-0017-exchange-capability-model.md) — surfaced
  it; `tpSlAtEntry` is the flag the two code paths read differently
- [`FEAT-0011`](../features/FEAT-0011-preflight-order-verification.md) — the
  gate whose rules collide here
