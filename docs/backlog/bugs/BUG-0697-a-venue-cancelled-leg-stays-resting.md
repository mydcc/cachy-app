---
id: BUG-0697
title: A venue-cancelled TP/SL leg stays resting, so the risk engine measures a stop the venue no longer holds
type: bug
status: done
priority: P1
milestone: none
created: "2026-10-18"
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
assignee: claude
---

# BUG-0697 — A venue-cancelled TP/SL leg stays resting

Branch: `fix/bug-0697-venue-cancelled-leg-stays-resting`

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

## Fix

Inverted, as this item proposed: a push is terminal unless it names `NEW`.

```ts
const closed =
    data.event === "CLOSE" || (data.status !== undefined && data.status !== "NEW");
```

The alternative — adding `SYSTEM_CANCELED` and `FAILED` to the existing pair —
was rejected because it keeps the same trap. It leaves the next value the enum
grows resting by default, and a leg that wrongly stays resting is the expensive
way to be wrong: `restingStopPrice()` reads it and the risk engine measures
against it. Inverted, a status this app has never seen is terminal.

A frame that names no status is *not* terminal. That is the behaviour that
stood before (`data.status ?? ""` matched nothing in the pair either), and the
only reading that does not delete a leg on the strength of a frame that says
nothing about it.

The removal is logged at `debug`, the way the superseded-response guard is, so
a leg that disappears is never invisible.

## Acceptance criteria

- [x] A test pushes `status: "SYSTEM_CANCELED"` and asserts the leg leaves the store
- [x] A test pushes `status: "FAILED"` and asserts the same
- [x] The terminal set is derived from the documented enum rather than a
      hand-written pair, or a comment names the document it mirrors — the test
      is inverted, and the comment above it names `08_websocket.md:366` with the
      five values that page lists
- [x] Removing a leg on a terminal frame is logged —
      `"[TpSl] leg removed on terminal push"` at `debug`, carrying the leg id,
      the status and the event
- [x] `restingStopPrice()` returns null once the only stop against that position
      was cancelled by the venue — asserted directly, and the positive assertion
      comes first so the test cannot pass on a store that never held the leg

All three tests go red with `src/stores/tpsl.svelte.ts` reverted, and the
messages name the defect: the leg dump still reports `status: "NEW"` with its
`triggerPrice`, and `restingStopPrice` returns `85` where the test expects
`null`. With the fix, `src/stores/tpsl.test.ts` is 52 passed of 52.

## Out of scope

- What a partial fill does to the remaining leg of a bracket. This item is about
  recognising the terminal statuses, not about `FILLED` semantics.
- Any change to how the risk engine treats an absent stop.

## Links

- [BUG-0665](BUG-0665-ws-push-strips-source-order-id.md) — the review this was found in
- [BUG-0660](BUG-0660-tpsl-drag-paper-order-not-found.md) — the drag path's `stripLegSuffix` fallback
- [`docs/bitunix-api/08_websocket.md`](../../bitunix-api/08_websocket.md) — the channel's status enum

## State

Done 2026-10-18 on branch `fix/bug-0697-venue-cancelled-leg-stays-resting`. On
this channel a status other than `NEW` is terminal, so a venue-initiated cancel
takes the leg out of the store: `SYSTEM_CANCELED` (liquidation, a filled bracket,
an ADL event) and `FAILED` both do now, and so will any value the enum grows
later. `restingStopPrice()` stops reporting the trigger, which is the read the
risk engine makes.

This closes the exception BUG-0665 recorded in its own State section. The
`positionId` that item chose to keep across a push is safe now, because a leg no
longer outlives its own terminal frame — the case it named as the reason the
keep was "only safe while this is open".

Not verified against a live Bitunix push: a system cancel is not something to
stage on a funded account, and paper mode has no WebSocket, so the statuses are
taken from the channel document whose own correction note this defect was
derived from. `FAILED` is documented only — no observed frame.

Deleted nothing and added no abstraction: one condition, one log line, three
tests.
