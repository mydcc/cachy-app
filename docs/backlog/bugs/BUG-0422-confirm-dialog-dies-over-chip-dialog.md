---
id: BUG-0422
title: Policy confirm dialog never appears over a chip dialog, the toggle stalls silently
type: bug
status: in-progress
priority: P1
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0422 — Policy confirm dialog never appears over a chip dialog, the toggle stalls silently

Branch: `fix/confirm-hang-blocks-toggles`

## Symptom

With the confirmation policy at its defaults (`leverage-change` and
`margin-mode-change` confirm), changing leverage or margin mode through the
account chips does nothing: the chip dialog's confirm button dismisses into
silence — no second dialog appears, no write runs, no error surfaces. Turning
the confirmations off in settings makes the same toggles work immediately.
Position mode alone always worked: it has no catalogue entry and never reaches
`modalState.show()`.

## Mechanism (verified live, Playwright against dev)

`confirmLeverage`/`confirmModes` await `modalState.show()`, which opens a
type-`dialog` window on top of the still-open chip dialog (a type-`modal`
window with `closeOnBlur: true`). `WindowManager.bringToFront()` sweeps every
*other* `closeOnBlur` window as a side effect of focusing the new dialog, so
the chip dialog underneath is destroyed mid-gesture. The confirm dialog dies
in the wake of that teardown: it is registered and then gone without any
`close()` on its id, and the awaiting promise never settles. The sweep's
documented intent (transient windows like the Symbol Selector) matches no
real type — only `modal` and `settings` set `closeOnBlur`, so in practice it
only ever kills real dialogs.

## Fix

- `bringToFront()` no longer closes `closeOnBlur` windows on focus change.
  Click-outside and Escape dismissal are untouched.
- `modalState.show()` resolves `false` immediately when a dialog is already
  open, instead of registering a duplicate whose promise can never settle.

## Acceptance criteria

- [ ] Margin-mode change with the policy on shows the policy confirm and the
      change completes on approval.
- [ ] A `closeOnBlur` modal stays open when a dialog is brought to front.
- [ ] A second `show()` while a dialog is open resolves `false`; nothing
      hangs.
- [ ] Click-outside and Escape still dismiss `closeOnBlur` windows.

## Out of scope

- Redesigning the confirmation UX (e.g. merging the two dialogs).
- A catalogue entry for position-mode changes.

## Links

- [FEAT-0024](../../../docs/backlog/features/FEAT-0024-confirmation-policy.md) — the confirmation catalogue and its defaults.
