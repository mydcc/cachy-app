---
id: BUG-0660
title: TP/SL chart drag fails in paper mode with tradeErrors.orderNotFound
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0660 — TP/SL chart drag fails in paper mode with tradeErrors.orderNotFound

## Symptom

A paper order with attached TP/SL is placed successfully ("Entry placed.
Stop: attached to the entry. Target: attached to the entry."), but
dragging the TP or SL line in the chart to a new price does nothing —
the line snaps back and the toast `TP/SL update failed:
tradeErrors.orderNotFound` appears (see report screenshot, ETHUSDT paper
position, TP 2600 / SL 2456.85). Paper-mode TP/SL drag therefore never
works; the live Bitunix path was fixed by BUG-0386, this is its paper
remainder.

## Evidence

**Demonstrated** (user report with screenshot) **plus derived**
mechanism from code reading. Reproduction: place a paper order with TP
+ SL attached, drag either chart line, observe the `orderNotFound`
toast and the unchanged resting level.

The id chain disagrees in three places:

- `src/services/paperExchange.ts:404` / `:717` — paper plan rows are
  grouped under `takeId("paper-tpsl")`, i.e. a non-numeric group id
  such as `paper-tpsl-3` (`tpSlRows`, `:294-320`, re-emits the row with
  `id: order.planGroupId`).
- `src/services/tpslNormalize.ts:193` — the row is split into chart
  legs `<baseId>-tp` / `<baseId>-sl` with `sourceOrderId: baseId`, so
  the dragged line carries e.g. `paper-tpsl-3-tp`.
- `src/services/tpslNormalize.ts:76-77` — `stripLegSuffix` only strips
  a **numeric** base (`/^(\d+)-(tp|sl)$/`), so a paper leg id passes
  through unchanged; `handleTpSlDrop`
  (`src/lib/windows/implementations/CandleChartView.svelte:810-888`)
  then finds `plan.sourceOrderId (paper-tpsl-3) !== baseId
  (paper-tpsl-3-tp)` and sends the leg id as `venueOrderId` (`:853`).
- `src/services/paperExchange.ts:485-535` — `modifyTpSlPlan` matches
  legs by `o.planGroupId === groupId`; the leg id matches no group, so
  `touched` stays false and it throws `PAPER_NO_ORDER` /
  `tradeErrors.orderNotFound`.

## Cause

BUG-0386 resolved the synthetic leg id back to the venue row id only
for numeric (Bitunix) ids. Paper-mode group ids are non-numeric, fall
through the numeric-base guard, and the venue/paper lookup receives a
leg id it has never seen.

## Fix

Resolve the plan row from the store by exact match on the dragged
line's own `orderId` (`tpSlState.orders.find(o => o.orderId ===
orderId)?.sourceOrderId`) — no string surgery, correct for paper and
any future non-numeric venue. Keep the BUG-0385 plan-ownership check.
Leave the live Bitunix path untouched.

**Done (opencode).** `handleTpSlDrop` now reads the base id from
`tpSlState.orders.find(o => o.orderId === orderId)?.sourceOrderId`,
falling back to `stripLegSuffix` when the store holds no such row. The
fallback is what still covers the pruned / not-yet-hydrated /
WebSocket-pushed leg (the WS split carries no `sourceOrderId`), so both
halves of the contract stay. The hard constraint is honoured:
`stripLegSuffix` is untouched and still strips a numeric base only.

For a numeric venue row the store and the regex agree, so the live
Bitunix path is behaviourally unchanged — asserted directly rather than
assumed.

Hardened during review: the lookup is scoped by symbol
(`ordersFor(normalizedSymbol)`), and the fallback uses `||` rather than
`??` so it matches the two other consumers of `sourceOrderId`
(`tpSlService.ts`, `TpSlEditModal.svelte`) — the row passthrough in
`normalizeTpSlRow` hands back whatever the venue sent when it already
carries a `planType`, so an empty `sourceOrderId` must fall through
rather than reach the venue as `orderId: ""`.

**Hard constraint (security review ses_ede1a5491ffe): do NOT widen the
`stripLegSuffix` regex to non-numeric bases.** The numeric guard is the
control bounding the fallback: with it gone, any genuine venue order id
legitimately ending in `-tp`/`-sl` would be truncated and sent as the
authoritative `orderId` to an endpoint that resolves orders by id alone
(no `symbol`/`positionId` cross-check, `tpSlService.ts:280-284`) — a
wrong-order modify. Treat `stripLegSuffix` as a display convenience,
never as the id sent to a venue.

## Acceptance criteria

- [x] A test reproduces the defect (paper plan with TP+SL, drag leg id
      `paper-tpsl-N-tp` through the drop path) and fails without the fix
- [x] The test passes with the fix — the paper leg moves, no
      `orderNotFound` toast
- [x] Dragging a TP/SL line on a live Bitunix-shaped numeric id still
      sends the base row id (BUG-0386 regression covered)
- [x] A failed drag still logs `logger.warn("api", "TP/SL drag update
      failed", …)` and refetches via `tpSlState.invalidate()`

## Links

- BUG-0386 (live-venue half of this defect, done)
- FEAT-0247 (draggable TP/SL lines), FEAT-0012 (paper trading mode)
- Open question for the live path (not this item's scope): the drag
  sends no `qty`, but Bitunix documents `tpQty`/`slQty` as required on
  `modify_order` (`docs/bitunix-api/06_tp_sl.md:254-255`); the paper
  simulator keeps the existing quantity instead. Confirm against a live
  account while fixing, or the live drag may fail for a different reason
  than paper.
