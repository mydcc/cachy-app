---
id: BUG-0688
title: Editing a position-wide plan splits into two dialogs and closes both after one leg
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: [BUG-0687]
assignee: opencode
branch: fix/tpsl-position-plan-second-leg
---

# BUG-0688 — Editing a position-wide plan splits into two dialogs and closes both after one leg

## Symptom

With BUG-0687 fixed — both legs now persist — the editing itself still reads
as two objects instead of one plan. Observed 2026-10-15 while testing that fix
on a live BTCUSDT position:

1. The position card shows `TP 84547.3 SL 81168.7`. *TP/SL setzen* opens.
2. The covered TP renders as a read-only line with an *Bearbeiten* link; only
   the other leg is a real input. Clicking *Bearbeiten* opens
   *Edit Stop Loss* **on top of** the create dialog.
3. Saving the stop closes **both** dialogs. To change the target as well, the
   trader reopens from the start: three dialogs, two saves, two full
   open/close cycles for one bracket.

> "Mir fällt auf, dass trotzdem immer nur TP oder SL geändert werden kann.
> Wird ein Wert bestätigt, schließen sich beide Fenster."

## Evidence

**Demonstrated.** Reproduction above, screenshots of the stacked dialogs
(`Set TP/SL` behind `Edit Stop Loss`), and the modal's own source: the
coverage branch rendered a static price plus an edit link
(`TpSlCreateModal.svelte`), and `handleEditSuccess` called `onsuccess?.()`,
which is the parent dialog's close.

## Cause

Three decisions that are each defensible alone and wrong together:

1. **Two per-leg dialogs around one venue plan.** The plan is *one* row on one
   endpoint ("max. one per position"), but the UI modelled it as two legs:
   `TpSlEditModal` edits a leg by `orderId`, the create modal a position by
   `positionId`. A trader thinks in brackets, not in legs.
2. **Two interaction metaphors in one section.** One leg was an editable
   slider/input; the other was a read-only line — the same object, two
   behaviours, and which one you got depended on state you did not choose.
3. **Nested close.** The inner dialog's `onsuccess` bubbled to the parent, so
   one save ended the whole flow — the second edit had to be found again.

The venue call for a combined edit already exists and is wired since
BUG-0687: `position/modify_order` takes `tpPrice` **and** `slPrice` in one
request, so nothing about the API forced the split.

## Fix

One form for the whole plan, in `TpSlCreateModal.svelte`:

- Both legs render as full inputs (`TpSlPriceInput` / plain fields), prefilled
  with the live plan when a leg is set.
- One trigger-type select governs both legs. Prefilled from the plan — the
  type both legs agree on, the only leg's type when there is one, the venue's
  default when they disagree. One form produces one request, so one select is
  the honest shape; it shows exactly what a save would send.
- One primary action: *Speichern* when a plan exists (`modify-position` with
  both legs), *Anlegen* when none does (`place-position`). No nested dialog,
  no edit links, one close.
- A leg that is set cannot be emptied here: `position/modify_order` says
  nothing about a leg a request omits, so clearing is refused with its own
  message rather than guessed at. Removing a leg stays in the TP/SL list's
  cancel action.

`TpSlEditModal` remains what it was — the per-leg editor for the TP/SL list,
where a row genuinely is one leg.

## Acceptance criteria

- [x] A covered leg opens prefilled and editable; no link, no nested dialog
- [x] One save edits both legs through one `modify-position` request, and
      closes the dialog once
- [x] Emptying a leg that is set is refused with a message, and nothing is sent
- [x] The trigger-type select is prefilled from the plan and applies to both legs
- [x] A position with no plan still places through `place-position`
- [x] The partial section and the TP/SL list's per-leg editor are unchanged

## Links

- [`BUG-0687`](BUG-0687-second-position-wide-leg-replaces-the-first.md) — the
  data loss this was found while testing; it wired `modify-position`
- [`FEAT-0070`](../features/FEAT-0070-bitunix-tpsl-placement.md) — its AC#3
  chose the edit-link shape this item supersedes
- [`TpSlCreateModal.svelte`](../../../src/components/shared/TpSlCreateModal.svelte),
  [`TpSlEditModal.svelte`](../../../src/components/shared/TpSlEditModal.svelte)
