---
id: BUG-0666
title: TP/SL edit modal modify bypasses the confirm-modifications policy
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0666 — TP/SL edit modal modify bypasses the confirm-modifications policy

## Symptom

A user switches the `modify-order` confirmation toggle on. Dragging a TP/SL
line on the chart now asks first (BUG-0663) — but editing the same leg's
price in the TP/SL edit modal and pressing Save still sends the modify
with no dialog. The toggle promises coverage it provides only for drags.

## Evidence

**Derived** — the defect follows from reading the code, but nobody has
seen it happen.

- `src/components/shared/TpSlEditModal.svelte:176` calls
  `activeExchange().trading.modifyTpSlOrder({...})` with no
  `confirmedAt` and no dialog anywhere in the component.
- `src/services/trade/tpSlService.ts` attaches `confirmAs:
  "modify-order"` only when `confirmedAt` is present, so the modal's
  requests resolve via the wire action `modify`, which
  `requiresForWireAction` answers `false` for — sent unprompted with
  the toggle on, exactly as before BUG-0663.

## Cause

BUG-0663 wired the drag but deliberately left the modal unwired: naming
the policy action on a call site that cannot produce a confirmation
would have bricked the modal behind the toggle. The modal still cannot
produce one — that is this item.

## Fix

Give the edit modal a confirm path mirroring the drag: validate as
today, then when the policy requires `modify-order`, show a
`ConfirmActionModal` (symbol + new level, gate's own field labels)
instead of dispatching; dispatch with the stamped `confirmedAt` on
confirm, stay on the form on cancel. What to leave alone: the
validation order (validate first, ask second), the `onsuccess` close
flow, and the service's conditional attach — which is what makes this
safe to add without touching the drag.

## Acceptance criteria

- [x] A test with the policy on reproduces the defect and fails without
      the fix (Save dispatches with no dialog)
- [x] The test passes with the fix (dialog shown, nothing dispatched
      until confirm; timestamped dispatch on confirm; silent stay on
      cancel)
- [x] Policy off: Save dispatches straight through, no dialog, no
      `confirmedAt`/`confirmAs` keys
- [x] No other wire action changes its confirm behaviour

**Done (opencode).** `handleSave` validates exactly as before, then —
when the policy requires `modify-order` — opens a `ConfirmActionModal`
as a sibling of the edit frame instead of dispatching. The dialog shows
the symbol, the new level, and — when the leg was resized — the new
size, in the gate's own field labels, all taken from the frozen
snapshot; confirm dispatches with the stamped `confirmedAt`
(and the service names `modify-order` via the conditional attach from
BUG-0663), cancel returns to the untouched form. The `onsuccess` close
flow and the validation order are unchanged, and the pre-existing
straight-through tests pass unmodified.

## Links

- BUG-0663 (the drag path; its done-note names this residual)
- FEAT-0024 (confirmation policy)
