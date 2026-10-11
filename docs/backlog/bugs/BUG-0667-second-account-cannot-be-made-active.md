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

The confirmation dialog was destroyed by the window manager — twice, at two
different moments.

1. `AccountList.handleSwitch` asks the policy first (`account-switch` defaults to `true` in `DEFAULT_CONFIRMATION_POLICY`, `src/lib/confirmationPolicy.ts:145`), so it sets `pendingSwitch` and mounts `ConfirmActionModal`.
2. `ModalFrame` registers a `ModalFrameWindow` (`windowType: "modal"`) via `windowManager.open()`.
3. `open()` ended in `bringToFront()`, whose closeOnBlur sweep closed **every other `closeOnBlur` window**. The settings pane carries `closeOnBlur: true` (`WindowRegistry.svelte.ts:331`), and the modal was mounted *inside* it.
4. Closing the pane unmounted `AccountList`, which unmounted `ConfirmActionModal`, whose `ModalFrame` cleanup called `windowManager.close()` on the dialog.

So the trader clicked, the settings pane closed, and the dialog went with it — no dialog, no switch. The store was never at fault: `setActiveAccount` writes correctly and was tested already (`settings.credentialStore.test.ts:423`).

**And a second time, one interaction later.** `WindowFrame` calls
`bringToFront(win.id)` on every `pointerdown`, so the first click *inside* the
dialog — the Confirm click — swept the host again and unmounted the dialog
before the click could land. Fixing only the registration left the trader with
a visible dialog they could not use.

Every modal opened from inside a window had this defect; the settings pane is
simply the one that hosts a control which opens one.

## Fix

The sweep rule moved to where the information is: `bringToFront` knows which
window is taking focus, so its default became *sweep unless the window taking
focus is a modal*. Two halves of one reading — BUG-0422 already said a modal is
never swept; this says a modal taking focus dismisses nothing, because it is a
blocking task on top of its host rather than the user moving on. That single
rule covers registration and the pointer-down, so no call site has to remember
it.

Modals also render in their own reserved band. `zLayers.ts` had always
documented `modal: 1_030_000` above `windowMax: 1_020_000`, but nothing used
it: a compact dialog kept a counter z-index (~11 000), so a **maximized**
settings pane drew over it. The pane maximizes itself below 768 px
(`isResponsive`, `edgeToEdgeBreakpoint`), so on a narrow viewport the reported
symptom persisted. `bringToFront` and `normalizeZIndices` now both honor the
band.

Leave alone: credential encryption shape (FEAT-0333), active-account visibility
on remaining surfaces (FEAT-0378), the sweep for every other focus change.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix — `WindowManager.test.ts` (BUG-0667 block): `expected false to be true` on `isOpen(settings.id)` immediately after a modal registers inside a `closeOnBlur` settings window, and again after the dialog is clicked
- [x] Two or more named accounts can be switched in either direction, with confirmation per FEAT-0024 (component test covers open → confirm → `setActiveAccount`, cancel, and the no-prompt policy; the dialog's facts are asserted inside the dialog, not document-wide)
- [x] The confirm dialog survives its own registration inside the settings pane
- [x] It survives being clicked, and a maximized pane no longer draws over it
- [x] A settings pane still closes when focus moves to a plain window — the sweep itself is unchanged

## Review follow-ups (swarm, 2026-10-11)

Four read-only reviewers ran on the first commit. Two found the pointer-down
half independently, which is the fix above; the rest are recorded here.

- **The exemption is broader than the modal's host** (accepted). Any modal
  taking focus now suppresses the sweep, so a lingering settings pane stays
  open behind an unrelated modal. That *is* the reading above — a modal is
  blocking, so the user's attention has not moved — and `settings` is the only
  non-modal type with `closeOnBlur`, so the blast radius is one pane. Left as
  designed rather than narrowed to "the modal's own host", which the window
  manager cannot know.
- **A revealed credential now stays in the DOM** (follow-up, not fixed here).
  `AccountCard`'s reveal state renders the key as plaintext, and the pane it
  lives in no longer unmounts when a modal opens. It is a defense-in-depth
  delta rather than a disclosure — the user had revealed it a moment earlier —
  and hiding it needs a deliberate rule (clear on pane focus loss? on modal
  open?), which is a product decision. Filed as its own item.
- **The first commit's claim was wrong about modals being singletons.**
  `WindowRegistry` gives the `modal` type `allowMultipleInstances: true`, so
  ids are generated per dialog and nothing is deduplicated. The exemption keys
  on `windowType`, so the fix was right, but the rationale was wrong and is
  corrected here and in the test comment.
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