---
id: BUG-0665
title: A TP/SL WebSocket push strips sourceOrderId, so cancel and edit address a row the venue never had
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

# BUG-0665 — A TP/SL WebSocket push strips sourceOrderId, so cancel and edit address a row the venue never had

## Symptom

On Bitunix, after the exchange pushes a TP/SL update over the WebSocket,
cancelling that plan from the TP/SL tab fails against an order the venue
has never heard of — and editing its trigger price fails the same way.
The trader gets an error toast for an action that worked seconds earlier.

The quieter half of the same cause: the "create TP/SL" modal stops
believing a position-wide plan already exists, and offers to create a
second one beside it.

## Evidence

**Derived** from code reading. Not yet reproduced live — the fix needs a
failing test before it, per the template's rule for derived bugs.

- `src/stores/tpsl.svelte.ts:285` `TpSlManager.updateFromWs` — the push
  handler rebuilds each leg from a fixed field list:

  ```ts
  const updated: TpSlOrder = {
      orderId: legId, symbol, planType, triggerPrice: price,
      status: data.status ?? "NEW",
      ...(positionId !== undefined ? { positionId } : {}),
  };
  if (index !== -1) this._orders[index] = updated;
  ```

  The push carries no `sourceOrderId` — it cannot, the WebSocket frame
  names the row, not the leg this app invented. So the replacement
  silently drops everything the fetch had recorded.

- `src/services/tpslNormalize.ts:176-206` `normalizeTpSlRow` — what gets
  dropped. It records `sourceOrderId` plus `qty`, `workingType`, `price`,
  `orderType`, `ctime`, `createTime`, `scopeGuess`; the push keeps only
  `orderId`, `symbol`, `planType`, `triggerPrice`, `status`, `positionId`.

- Consequence A, cancel — `src/components/shared/TpSlList.svelte:90` hands
  the store row straight to `cancelTpSlOrder`, which resolves the id at
  `src/services/trade/tpSlService.ts:237`:

  ```ts
  const orderId = order.sourceOrderId || order.orderId || order.id;
  ```

  That file's own comment states the hazard: *"on a normalised plan,
  `orderId` is the leg id this app invented ("123-tp"), which the venue has
  never heard of. The row id it was split from is the one that cancels
  something."* After a push the first term is gone, so the leg id goes out
  instead.

- Consequence A, edit — `src/components/shared/TpSlEditModal.svelte:180`
  resolves the same way, with the same reasoning in its comment.

- Consequence B — `src/components/shared/TpSlCreateModal.svelte:75-76`:

  ```ts
  const tpCoveredByPositionPlan = existingPlans.profit?.scopeGuess === "position";
  ```

  `scopeGuess` is dropped too, so an existing position-wide plan reads as
  absent. That file's own comment (`:70-72`) names the two outcomes:
  *"either a refused create (visible) or a second plan where the trader
  expected an edit (quiet)"*.

- Cosmetic — `TpSlList.svelte:227` renders `order.ctime || order.createTime || 0`,
  so the created-at column falls back to the epoch after a push.

Reachable from `src/services/bitunixWs/channelDispatch.ts:302-303`, i.e.
any TP/SL channel push. Paper mode has no WebSocket, so this is live
Bitunix only.

Not introduced by BUG-0660/0661 and not touched by them — the drag path
there has a `stripLegSuffix` fallback and degrades to a venue refusal,
which is why it never surfaced in those fixes.

## Cause

A push is treated as the whole truth about a leg when it is only an
update to one field. `updateFromWs` replaces rather than merges, so the
fetch-time provenance — above all *which row this leg came from* — is
discarded by the first WebSocket frame, and every consumer that needs it
falls back to the invented leg id.

## Fix

Spread the existing row instead of rebuilding it, so the push updates the
fields it actually carries and the rest survives:

```ts
this._orders[index] = {
    ...this._orders[index],
    orderId: legId, symbol, planType, triggerPrice: price,
    status: data.status ?? "NEW",
    ...(positionId !== undefined ? { positionId } : {}),
};
```

A leg the push *creates* (`index === -1`) still has nothing to inherit, so
its `sourceOrderId` stays `undefined` — correct, and the reason BUG-0660's
`stripLegSuffix` fallback must stay.

**Open question, decide before implementing.** `positionId` is spread
conditionally above, so a push *without* a position id keeps the row's
previous one. That is probably right (the leg has not stopped belonging to
the position) but it is a judgement, not a documented rule — check it
against a real push that carries no `positionId`.

## Acceptance criteria

- [ ] A test reproduces the defect: hydrate a leg with `sourceOrderId`
      (and `scopeGuess`, `ctime`), push a WebSocket update for it, and
      assert those fields survive. It fails without the fix.
- [ ] The test passes with the fix
- [ ] Cancelling a plan after a WS push sends the row id, not the leg id
- [ ] `TpSlCreateModal` still treats a position-wide plan as covering after
      a push (consequence B, the quiet one)
- [ ] `workingType` is deliberately dropped rather than spread — it is read
      nowhere today; if the fix spreads it, say so in the item rather than
      carrying it by accident

## Links

- BUG-0292 — the leg-id scheme this depends on (`orderId` is
  `<sourceOrderId>-tp` / `-sl`, invented locally)
- BUG-0660 — the drag path's `stripLegSuffix` fallback, which exists
  precisely because a WebSocket-pushed leg carries no `sourceOrderId`
- BUG-0647 — priority calibration: same `area: execution`, a modify that
  re-sent the wrong thing to a live venue, also P1
- Found while reviewing #4007 / #4008; reported there as a follow-up and
  deliberately not fixed inside either PR