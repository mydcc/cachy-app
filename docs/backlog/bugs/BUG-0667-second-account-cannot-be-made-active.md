---
id: BUG-0667
title: Second exchange account cannot be made active, only the first account stays active
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: [FEAT-0026]
assignee: opencode
branch: fix/bug-0667-account-switch
shipped: unreleased
---

# BUG-0667 — Second exchange account cannot be made active, only the first account stays active

## Symptom

A second account can be added under Settings > Connections, but it cannot be activated. Only the first account ever stays active. Switching between two or more accounts, and seamless switching between accounts, does not work.

Observed 2026-10-11 on `dev.cachy.app` (screenshots IST-Zustand, Bild 3):
- Bitget card shows `ACTIVE`, Bitunix card shows `Make active` + `Remove`.
- Clicking `Make active` on the second account does not switch the active account.
- Reported 2026-10-11 in session: **no confirmation dialog appears at all** on that click.

## Evidence

**Demonstrated** by user screenshots, **proven** for the mechanism by tests.

- Demonstrated: Settings > Connections shows two credential cards; the non-active card offers `Make active` but the active marker never moves. Market Activity + order panel stay on the first account.
- Proven: the click reaches `setActiveAccount` — `AccountList.accountSwitch.component.test.ts` mounts the list with two accounts, clicks `Make active` and pins that the confirm dialog opens with both account names and that nothing has switched yet (5/5 green).
- Proven: the dialog never survives its own registration — `WindowManager.test.ts` (BUG-0667 block) fails without the fix with `expected false to be true` on `isOpen(settings.id)` immediately after a modal registers inside a `closeOnBlur` settings window.

## Cause

The confirmation dialog was destroyed by the window manager in the same tick it opened.

1. `AccountList.handleSwitch` asks the policy first (`account-switch` defaults to `true` in `DEFAULT_CONFIRMATION_POLICY`, `src/lib/confirmationPolicy.ts:145`), so it sets `pendingSwitch` and mounts `ConfirmActionModal`.
2. `ModalFrame` registers a `ModalFrameWindow` (`windowType: "modal"`) via `windowManager.open()`.
3. `open()` ended in `bringToFront()`, whose closeOnBlur sweep closed **every other `closeOnBlur` window**. The settings pane carries `closeOnBlur: true` (`WindowRegistry.svelte.ts:331`), and the modal was mounted *inside* it.
4. Closing the pane unmounted `AccountList`, which unmounted `ConfirmActionModal`, whose `ModalFrame` cleanup called `windowManager.close()` on the dialog.

So the trader clicked, the settings pane closed, and the dialog went with it — no dialog, no switch. The store was never at fault: `setActiveAccount` writes correctly and was tested already (`settings.credentialStore.test.ts:423`).

Every modal opened from inside a window had this defect; the settings pane is simply the one that hosts a control which opens one.

## Fix

`bringToFront()` takes `sweepCloseOnBlur`, and `open()` passes `false` when it registers a `modal`. Registering a modal is not the user clicking elsewhere — the modal was mounted inside the window the sweep would have dismissed. Every other call site keeps the sweep unchanged, so the settings pane still closes on a click away from it, and Escape/click-outside dismissal are untouched.

Leave alone: credential encryption shape (FEAT-0333), active-account visibility on remaining surfaces (FEAT-0378), the `modal` singleton in `open()` (a second modal is still deduplicated by type — correct for now, unrelated to this defect).

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix — two accounts configured, activating the second opens the confirm dialog
- [x] Two or more named accounts can be switched in either direction, with confirmation per FEAT-0024 (component test covers open → confirm → `setActiveAccount`, cancel, and the no-prompt policy)
- [x] The confirm dialog survives its own registration inside the settings pane (`WindowManager.test.ts`, BUG-0667 block)
- [x] A settings pane still closes when focus moves to a plain window — the sweep itself is unchanged
- [x] The tests pass with the fix (74/74 window suite, 5/5 AccountList)
- [x] German and English strings for any touched switch UI — none touched, so no new keys

## Out of scope

- Bitget UTA vs Classic routing (ADR-0023); this item is account selection only
- Showing `holdMode` / position mode per account (BUG-0668 / separate gap from 2026-10-11 screenshots)
- Automatic account failover or merging data across accounts

## Links

- FEAT-0026 — multi-account feature this regressed
- FEAT-0024 — `account-switch` confirmation
- FEAT-0333 — account storage shape
- FEAT-0378 — account name on remaining surfaces
- BUG-0422 — the earlier half of this fix (modals survive the sweep); this item is the host side
- FEAT-0044 — the window manager, `WindowManager.bringToFront`, FEAT-0045 — Academy window