---
id: BUG-0663
title: TP/SL drag modify cannot be gated by the confirm-modifications policy
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

# BUG-0663 — TP/SL drag modify cannot be gated by the confirm-modifications policy

## Symptom

Enabling the settings toggle for confirming order modifications changes
nothing for chart TP/SL drags: one gesture, no dialog, no second look,
and the mutation is dispatched straight through `gatedRequest`
(`CandleChartView.svelte:856`). A mis-drop in a fast market is
unrecoverable by design, while the UI implies a protection that
structurally cannot exist for this action.

## Evidence

**Derived** from code reading; the key sets are unambiguous.

- `src/lib/confirmationPolicy.ts:66-83` — `GATED_ACTIONS` contains
  `"modify-order"` but `WIRED_ACTIONS` contains only
  `"flash-close-position"`; `requires()` (`:105-107`) returns `false`
  for anything gated-but-unwired.
- Independently, the wire action for this path is `"modify"` (from
  `payload.action` on `/api/tpsl`, `orderGate.ts:126-140`), and
  `"modify"` is **not** in `CONFIRMABLE_ACTIONS` — so
  `requiresForWireAction("modify")` → `false`
  (`rmsService.ts:357-358` registers the check).

## Cause

The confirmation policy was never wired for the modify wire action, so
no TP/SL drag can ever require confirmation regardless of the setting.

## Fix

Decide and record it: either add `"modify"` to `CONFIRMABLE_ACTIONS`
and give `handleTpSlDrop` a `confirmAs`/`confirmedAt` path, or state
explicitly — in the settings hint and in `confirmationPolicy.ts` — that
TP/SL drag modifications are intentionally unconfirmable and guarded
only by the side/tick precheck.

## Acceptance criteria

- [x] The decision is recorded in the file (no "not decided yet")
- [x] Either a drag modify prompts when the policy requires it, or the
      settings hint plus a code comment state that drag modifies are
      intentionally unconfirmable
- [x] No other wire action changes its confirm behaviour

**Done (opencode) — decision (a): the drag prompts.** `handleTpSlDrop`
routes through `submitTpSlModify`: when the policy requires
`modify-order`, the drop stops and a `ConfirmActionModal` asks, carrying
the symbol and the new TP/SL level in the gate's own field labels; the
confirmation timestamp travels as `confirmedAt` and the intent names the
policy action via `confirmAs: "modify-order"` (the wire action `modify`
is not a catalogue member, so the gate would otherwise find nothing to
ask about). Cancelling refetches instead of dispatching, because the
price line moved optimistically on drop.

`"modify-order"` joined `WIRED_ACTIONS` so `requires()` returns the
user's choice. `cancel` and `place` on the same endpoint stay unmapped
on purpose: their call sites do not confirm, and declaring them wired
would make the gate refuse those actions outright once the toggle is
on — unusable, not protected.

AC3 (`confirmAs` only when confirmed): the edit modal shares
`modifyTpSlOrder` and has no dialog, so its requests name no policy
action and travel exactly as before. Pinned by a service-level test
that fails if the attach ever becomes unconditional.

## Links

- FEAT-0024 (confirmation policy), BUG-0660 (the drag path)
