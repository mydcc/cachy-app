---
id: BUG-0697
title: A venue-cancelled TP/SL leg stays resting, so the risk engine measures a stop the venue no longer holds
type: bug
status: ready
priority: P1
milestone: none
created: "2026-10-18"
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0697 — A venue-cancelled TP/SL leg stays resting

Found while reviewing #4134 (BUG-0665). Not introduced by it and not fixed by
it: the terminal status list is untouched by that change.

## Symptom

The venue can cancel a stop on its own — liquidation, a filled bracket, an ADL
event. Cachy is told, and does nothing with it. The leg stays in the store, the
card keeps rendering it, and `restingStopPrice()` keeps returning its trigger.
The risk engine then measures a position as protected by a stop the venue is no
longer holding.

Nothing is logged, and the display contradicts the venue with nothing saying
so — the failure shape BUG-0661 exists to prevent.

## Evidence

**Demonstrated** from the code and the repository's own channel document.

`src/stores/tpsl.svelte.ts:289`, in `updateFromWs`, decides terminality on a
two-value list:

```ts
const closed = data.event === "CLOSE" || ["CANCELED", "FILLED"].includes(data.status ?? "");
```

`docs/bitunix-api/08_websocket.md:366` documents the channel's enum as
`NEW` / `CANCELED` / `SYSTEM_CANCELED` / `FILLED` / `FAILED`, and the note below
it (`:383`, `:391`) records the correction:

> … including `SYSTEM_CANCELED`, which is how a venue-initiated cancellation is
> distinguished from a user-initiated one.

`docs/bitunix-api/12_doc_defects.md:132` logs the same thing as a documentation
defect that was fixed. The consumer was not updated with it.

So a `SYSTEM_CANCELED` or `FAILED` frame falls through to the update branch: the
leg is rewritten carrying that status and stays in `_orders`.

## Cause

The status list was written from the vendor's original post and never revisited
when the mirror corrected the enum. `FAILED` was never in it at all.

## Fix proposal

Add both to the terminal set — or, better, invert the test: on this channel
every status other than `NEW` is terminal, which cannot go stale the next time
the enum grows. Whichever is chosen, log the removal at `debug` the way the
superseded-response guard does, so a terminal frame is never invisible.

## Acceptance criteria

- [ ] A test pushes `status: "SYSTEM_CANCELED"` and asserts the leg leaves the store
- [ ] A test pushes `status: "FAILED"` and asserts the same
- [ ] The terminal set is derived from the documented enum rather than a
      hand-written pair, or a comment names the document it mirrors
- [ ] Removing a leg on a terminal frame is logged
- [ ] `restingStopPrice()` returns null once the only stop against that position
      was cancelled by the venue

## Out of scope

- What a partial fill does to the remaining leg of a bracket. This item is about
  recognising the terminal statuses, not about `FILLED` semantics.
- Any change to how the risk engine treats an absent stop.

## Links

- [BUG-0665](BUG-0665-ws-push-strips-source-order-id.md) — the review this was found in
- [BUG-0660](BUG-0660-tpsl-drag-paper-order-not-found.md) — the drag path's `stripLegSuffix` fallback
- [`docs/bitunix-api/08_websocket.md`](../../bitunix-api/08_websocket.md) — the channel's status enum
