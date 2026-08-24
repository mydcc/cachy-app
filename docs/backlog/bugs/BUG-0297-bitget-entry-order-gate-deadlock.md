---
id: BUG-0297
title: An entry order on a venue that cannot attach TP/SL is refused by the gate whichever way it is built
type: bug
status: in-progress
assignee: claude
branch: bug-0297-entry-gate-deadlock
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

`orderGate.checkPrices` asks a narrower question than `displayed.stopLossPrice`
answers. The field means "the stop this position will have"; the price rule
needs "the stop this request carries". `entryCarriesProtection()` supplies the
second, and the stop and target comparisons are skipped when it is false.

**Derived from the venue's declaration, not from the caller.** The sketch above
proposed a flag on `DisplayedState` set by `placeEntryGroup`. That was the
wrong shape: a `stopLossAttached: false` from any caller would switch the stop
comparison off, and a gate must not accept from the code it is checking the one
input that decides whether it checks. `capabilitiesOf(provider).tpSlAtEntry` is
a fact about the venue instead, and a payload that attaches protection anyway
is already refused as `unsupported` *before* the price rule runs — so nothing
reaches transport uncompared.

Scoped to `place-order`. The standalone TP/SL endpoints exist to carry these
levels and their payloads must still match, so they are unaffected.

Left alone as planned: the size rule keeps reading the displayed stop (the
quantity really does derive from the intended stop distance), and a genuine
mismatch is still refused wherever the venue attaches.

## Acceptance criteria

- [x] A test builds the entry `orderPlacementService` actually produces for a
      `tpSlAtEntry: false` venue and shows the gate refusing it
      → `orderPlacementService.gateIntegration.test.ts`, which stubs only the
      network and runs `placeEntryGroup → tradeService.placeOrder → gate`
      whole. Confirmed failing before the fix: 4 of 8 red, the Bitget entry
      never reaching transport at all.
- [x] That test passes with the fix, and the equivalent Bitunix entry is
      unaffected
      → same file pins the Bitunix entry still carrying `slPrice`/`tpPrice` on
      the payload.
- [x] The gate still refuses a payload whose stop disagrees with the displayed
      stop, on both venues
      → on an attaching venue by the price rule, and on a non-attaching one by
      the capability rule, which is stricter: it cannot carry a stop at all.
      Both pinned under "what must still be refused".
- [x] A stop that fails to arrive in the follow-up request is still reported as
      unprotected (`orderPlacementService`'s retry path is untouched)
      → "still calls the position unprotected when the separate stop never
      lands". This is the test that makes the exemption safe to grant: without
      it the fix would trade a deadlock for a silently unprotected position.

## Links

- [`FEAT-0017`](../features/FEAT-0017-exchange-capability-model.md) — surfaced
  it; `tpSlAtEntry` is the flag the two code paths read differently
- [`FEAT-0011`](../features/FEAT-0011-preflight-order-verification.md) — the
  gate whose rules collide here
