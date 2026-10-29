---
id: BUG-0671
title: No test drives a real modal through the window manager, so a dialog's visibility is unproven
type: bug
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [BUG-0667]
---

# BUG-0671 — No test drives a real modal through the window manager, so a dialog's visibility is unproven

## Symptom

Nothing in the suite can tell whether a modal a component mounts actually
appears on screen, stays mounted while the trader uses it, or is drawn above
the window that opened it. Every part of that chain is tested with the rest of
it stubbed out, so a break anywhere in the middle is invisible.

This is not theoretical. BUG-0667 shipped two separate defects through the
untested seam, and a third of its class was found only by review:

1. Registering the account-switch confirm swept the settings pane that mounted
   it, unmounting the dialog in the same tick.
2. Fixing that left the same sweep firing on the first pointer-down *inside*
   the dialog, so the Confirm click tore the dialog down before it landed.
3. A compact dialog kept a counter z-index (~11 000) while a maximized pane
   renders at `Z_LAYERS.windowMax` (~1 020 000), so on a viewport narrow enough
   for the pane to maximize itself the dialog was drawn behind it.

All three are "the dialog is not usable", all three are user-visible, and none
of them turned a test red.

## Evidence

**Demonstrated** — each stub and each absence is named. Not one of them is a
hypothesis about behaviour.

- `src/components/shared/ModalFrame.component.test.ts` mocks `windowManager`
  outright (`openSpy`/`closeSpy`), so it can prove what `ModalFrame` asks the
  manager to do and nothing about what the manager then renders.
- `src/components/settings/AccountList.accountSwitch.component.test.ts` stubs
  `ModalFrame` with `tests/helpers/PassthroughModalFrame.svelte` — the helper's
  own header explains that the real frame registers a window somewhere else in
  the tree, which is exactly the half it removes.
- The window tests that exist stub their content:
  `WindowContainer.component.test.ts` and `WindowFrame.component.test.ts` both
  return `EmptyStub` from `get component()`, so neither renders a real modal.
- `src/lib/windows/WindowManager.test.ts` is real but synthetic: `TestWindow`
  subclasses with no `component`, so nothing is ever rendered. It can assert
  the sweep and the z-band — which is how the two BUG-0667 halves were pinned —
  but not that a dialog becomes visible to a person.
- No e2e spec opens Settings and clicks "Make active". The settings specs that
  do exist are layout checks (`settings-buttons-width.spec.ts`,
  `density.spec.ts`); the WASM specs are the only others that touch settings.

The two ends are each tested against a fake of the other, so the seam between
them — "a component mounted a `ModalFrame`, and a frame rendered in
`WindowContainer`" — is covered by nothing.

## Cause

The window manager is exercised at unit level against a window that renders
nothing, and its consumers are exercised against a manager that is mocked or
stubbed away. Neither side mounts the real pair, so an integration failure has
no assertion that can fail.

## Fix

Add an integration test that mounts `WindowContainer` together with a real
`ModalFrame`-based modal (`ConfirmActionModal` is the smallest real one) and
asserts what a trader would see:

- the dialog's content is rendered into the container, not merely requested
- a `pointerdown` inside the dialog keeps it mounted (the BUG-0667 half that
  the manager test can only model, not observe)
- a maximized host does not draw over it — `innerWidth` must be set explicitly
  or maximized, because happy-dom defaults to 1024 and the pane only maximizes
  itself below its 768 px breakpoint

Leave alone: the existing unit suites. They pin the rules; this pins that the
rules reach a screen.

## Acceptance criteria

- [ ] A test mounts `WindowContainer` and a real `ModalFrame` modal together
- [ ] It fails if the closeOnBlur sweep takes the modal's host (both the
      registration and the pointer-down path)
- [ ] It fails if the modal is not stacked above a maximized host window
- [ ] It asserts rendered content, not a manager call
- [ ] It does not mock `windowManager`, `ModalFrame` or `WindowContainer`

## Out of scope

- Re-testing the sweep and z-index rules themselves — `WindowManager.test.ts`
  covers them and is the right place for them
- A browser-based e2e for the account-switch flow; that is a bigger surface and
  a separate decision
- Any change to the window manager's behaviour

## Links

- BUG-0667 — the defect this gap let through twice, plus the layering case
- BUG-0422 — the earlier sweep defect in the same area
- `src/components/shared/windows/WindowContainer.svelte` — renders the frames
- `src/tests/helpers/PassthroughModalFrame.svelte` — the stub whose own
  documentation describes the missing half