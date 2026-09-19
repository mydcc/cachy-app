---
id: BUG-0503
title: On Bitget every entry carrying a stop opens an unprotected position, because the deferral the gate grants is fulfilled by nothing
type: bug
status: specced
priority: P0
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0503 — Bitget entries open a position that can never be protected

## Symptom

A trader on Bitget enters a stop-loss in the calculator and places the order.

The entry is sent **without the stop**. The gate lets it through. The position
opens. Cachy then spends about 2.4 seconds appearing to retry, does nothing at
all in that time, and reports the position as UNPROTECTED.

The trader now holds a live leveraged position with no stop, and no way to place
one from Cachy — the TP/SL controls are refused on this venue too. The only
remedy is to open Bitget's own interface and place the stop by hand, while the
position is running.

This is not an edge case. On Bitget it is the outcome of **every** entry that
carries a stop.

## Evidence

**Derived, from reading the code.** One boolean is read at three sites to answer
three different questions, and the three answers do not compose.

`bitgetCapabilities.ts:40` declares `tpSlAtEntry: false`. The adapter is
explicit that this is a statement about Cachy, not about Bitget —
`src/services/exchange/bitgetAdapter.ts:38`:

```
 * Two declarations, two questions. `SUPPORTS` answers "has Cachy wired this
 * verb end-to-end here", `capabilities` answers "what will the venue take on
 * an order". They are deliberately separate — Bitget genuinely accepts
 * attached TP/SL, and Cachy still declares `tpSlAtEntry: false`, because it
 * has no verified wire format for it.
```

The gate reads the same flag and calls it the opposite thing —
`src/services/orderGate.ts:1201`: "`tpSlAtEntry: false` is a fact about the
venue". Following that reading, `entryCarriesProtection`
(`src/services/orderGate.ts:1208`) returns false, and `checkPrices`
(`:1226`) excuses the displayed stop from comparison entirely, recording the
decision in the audit:

```typescript
const carriesProtection = this.entryCarriesProtection(intent);
if (!carriesProtection && displayed.stopLossPrice !== undefined) {
    checked.push("protectionDeferred");
}
```

with the comment that the stop "is placed by a later request and compared
there". That later request is the promise. Nothing keeps it.

**Step 1 — the entry goes out naked.** `placeEntryGroup` sets
`attach = caps.tpSlAtEntry`, so on Bitget `stopLoss` is `undefined` in the
payload while `displayed.stopLossPrice` still carries the trader's stop
(`src/services/orderPlacementService.ts:135`).

**Step 2 — the retry cannot fire.** `confirmProtection` finds no loss plan and
calls `replaceStop`, which reads the same flag a third time and returns
immediately — `src/services/orderPlacementService.ts:318`:

```typescript
private async replaceStop(plan: EntryPlan): Promise<void> {
    if (!capabilitiesOf(plan.exchange).tpSlAtEntry) {
        return;
    }
```

Its comment claims such venues "cannot take a position plan either, so they skip
straight to the honest UNPROTECTED outcome". But the loop does not skip: with
`STOP_RETRY_ATTEMPTS = 2` and `STOP_RETRY_DELAY_MS = 1200`
(`orderPlacementService.ts:120`, `:128`) it re-reads the plans three times and
sleeps twice around a function that returns on its first line. The position is
open and unprotected for the whole of it.

**Step 3 — there is no stop path at all.** The claim that a standalone plan is
impossible is true on Bitget, but for a different reason, and it is decided by a
*different* declaration — `src/services/exchange/bitgetAdapter.ts:140`:

```typescript
const SUPPORTS: TradingSupport = {
    tpSl: false,
    ...
```

Every TP/SL verb is refused on that flag: `placePositionTpSl`, `placeTpSlOrder`,
`modifyTpSlOrder`, `cancelTpSlOrder` (`bitgetAdapter.ts:236`, `:238`, `:234`,
`:232`), and `fetchTpSlOrders` resolves empty (`:227`). So `readPlans` on Bitget
returns empty by construction — `haveStop` can never be true — and the trader
cannot place the missing stop from Cachy afterwards either.

The three readings, side by side:

| Site | Question it asks | Right flag |
|---|---|---|
| `placeEntryGroup` | may this order attach a stop? | `tpSlAtEntry` ✓ |
| `entryCarriesProtection` | is a displayed stop excused from comparison? | `tpSlAtEntry` — but only sound if the deferral is honoured |
| `replaceStop` | can this venue take a standalone stop? | `SUPPORTS.tpSl`, not `tpSlAtEntry` |

## Cause

BUG-0297 (done) reported that a Bitget entry was refused whichever way it was
built, and treated the refusal as the defect. The fix taught the gate to excuse
a stop that travels separately. It made the order **acceptable** without making
the protection **possible**, and the failure mode moved from a loud refusal
before anything was sent to a silent naked position after the fact.

A refusal costs the trader an order. An unprotected leveraged position costs
them the account. The fix traded the cheap failure for the expensive one.

Underneath it is the overloaded flag. `tpSlAtEntry` means "Cachy has no verified
wire format for attachment here", and two of its three readers treat it as
"the venue cannot do stops". A capability model that mixes a fact about the
client with a fact about the venue will keep producing this class of defect.

## Fix

The entry must not be sent when the stop that was configured cannot be placed.

1. **Refuse the entry in the gate.** When a stop is displayed and the venue can
   neither attach it (`tpSlAtEntry`) nor take it standalone (`SUPPORTS.tpSl`),
   the order is unfulfillable as specified and must be refused before it leaves
   — with a message naming the venue and the missing capability, not a generic
   mismatch. This restores BUG-0297's safety without restoring its dead end: the
   trader can still place a stopless entry deliberately by clearing the stop
   field, which is an explicit choice rather than a silent downgrade.
2. **Only defer to something that exists.** `entryCarriesProtection` may excuse
   the stop from comparison only when a later request will actually carry it.
   Gate the deferral on `SUPPORTS.tpSl` as well, so the audit's
   `protectionDeferred` records a deferral that is real.
3. **Fix `replaceStop`'s flag.** It asks whether a standalone plan is possible;
   that is `SUPPORTS.tpSl`. Reading `tpSlAtEntry` there is what makes the retry
   a no-op on a venue that could otherwise be retried, and would silently skip
   the retry on any future venue that attaches nothing but accepts a standalone
   stop.
4. **Do not sleep around a no-op.** When no retry is possible, return the
   UNPROTECTED result immediately instead of spending the retry budget — the
   comment already says this is the intent.
5. **Separate the two declarations in the capability model.** "Venue accepts
   attached TP/SL" and "Cachy has a verified wire format for it" are different
   facts and need different fields. The adapter comment already names the
   distinction; the model does not yet carry it.

Step 1 alone removes the financial exposure and is the part worth shipping
first. Steps 2–4 are small and stop the same shape recurring on the next venue.

Whether Bitget entries are reachable at all today is affected by BUG-0501 —
Bitget has no `symbolMeta`, so the size guards skip — and by BUG-0495. Those
change how often this fires, not whether the path is sound.

## Acceptance criteria

- [ ] A test places a Bitget entry with a stop and asserts the entry is refused
      before any request is sent
- [ ] The test fails without the fix
- [ ] The refusal names the venue and the missing capability
- [ ] A Bitget entry with no stop configured is still placed
- [ ] `entryCarriesProtection` returns false only when a later request will
      carry the stop
- [ ] `replaceStop` reads `SUPPORTS.tpSl`, and a venue that supports standalone
      plans but not attachment is retried
- [ ] When no retry is possible, the UNPROTECTED result returns without
      consuming the retry delay
- [ ] Bitunix behaviour is unchanged across all of the above

## Links

- BUG-0297 — the fix that converted this refusal into a silent unprotected
  position; this item is its consequence, not a regression of it
- FEAT-0017 — the capability model that step 5 belongs in
- FEAT-0229 — `SUPPORTS` and the refuse-unsupported-verbs-locally discipline
  that steps 2 and 3 extend to this path
- BUG-0502 — the same confirmation step, failing for a different reason on a
  venue that *can* place stops
- BUG-0501 — the other structural Bitget gap found in this audit
