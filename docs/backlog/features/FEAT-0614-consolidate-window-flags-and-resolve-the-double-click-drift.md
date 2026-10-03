---
id: FEAT-0614
title: Consolidate the window flags and resolve the double-click state drift
type: feature
status: ready
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0604
data_class: none
adr: none
depends_on: [FEAT-0604]
---

# FEAT-0614 — Consolidate the window flags and resolve the double-click drift

The window system carries ~30 flags, several of which claim the same concern
and none of which document which wins. Magnetic tiling cannot be designed until
that is settled.

## Problem

Three overlapping sets:

| Concern | Keys |
| --- | --- |
| Maximize | `allowMaximize`, `showMaximizeButton` |
| Header | `headerAction`, `headerButtons`, `doubleClickBehavior`, `doubleClickAction` |
| Chrome | `isTransparent`, `enableGlassmorphism`, `enableBurningBorders`, `showBackdrop`, `showCachyIcon`, `showIcon` |

Nothing states which of a pair wins, so the behaviour of any individual window
is only discoverable by reading its implementation file.

There is also a live type/state drift. `doubleClickBehavior` is typed
`'maximize' | 'pin'`, but `resolveDoubleClickAction()` in
`WindowBase.svelte.ts` explicitly widens for the value `'minimize'` that
persisted state can still carry. A user who saved window state before the
narrowing has a value the type no longer admits, and their window can behave
differently on reload than it did before.

This is not cosmetic. Magnetic tiling has to decide what a window's edge
behaviour is, and it cannot while two flags mean the same thing.

## Proposal

Reduce `WindowFlags` to one key per concern, migrate all 17 window
implementations, and write a migration that resolves the persisted
`doubleClickBehavior: 'minimize'` case explicitly.

The reduction is a breaking change to a type other code imports, so each
merged flag keeps its existing behaviour as the default and every implementation
is migrated in the same PR.

## Acceptance criteria

- [ ] `WindowFlags` has exactly one key per concern; every merged or removed key
      is listed in the PR description with its replacement
- [ ] All 17 window implementations compile against the reduced flag set
- [ ] The persisted `doubleClickBehavior: 'minimize'` case is handled by an
      explicit migration, with a test that feeds stored state containing it and
      asserts the resolved behaviour
- [ ] The migration runs on load for existing users without data loss; a test
      covers a stored state written by the previous version
- [ ] `WindowBase.saveState()` / `restoreState()` write and read the reduced set
- [ ] Every window implementation's existing test passes unmodified
- [ ] A docblock on `WindowFlags` states the precedence rule for the remaining
      keys, so the next overlapping flag is caught in review
- [ ] No window's observable behaviour changes, except that a persisted
      `minimize` now resolves deterministically

## Out of scope

- Snapping, tiling, or any new window gesture. That is
      [FEAT-0615](FEAT-0615-add-magnetic-snapping-and-edge-tiling-for-windows.md).
- Changing `pinSide` semantics. `togglePin()` is already annotated *"Pinning
      logic (experimental tiling)"* and does exactly one thing — flip a flag,
      un-maximize, save. It is left as it is until FEAT-0615 gives it a
      purpose.
- Window sizing, which [BUG-0411](../bugs/BUG-0411-modal-windows-oversized-polish.md)
      (`done`) already settled.
- `zLayers.ts`, whose duplication against 29 raw z-index literals is catalogued
      as C3 in the audit and not yet filed as work.

## Open questions

- Is `showHeaderIndicators` part of the header concern or its own? It reads as
  its own, but it is not in any of the three overlapping sets.
- Should `pinSide` survive at all, given only one call site ever sets it? If
  FEAT-0615 does not use it, deleting it here is cheaper than carrying it.

## Links

- Evidence: [`assets/FEAT-0604/ui-zustandsaufnahme.md`](../assets/FEAT-0604/ui-zustandsaufnahme.md) §2.1 and §2.2
- `src/lib/windows/types.ts`, `src/lib/windows/WindowBase.svelte.ts`
- [BUG-0411](../bugs/BUG-0411-modal-windows-oversized-polish.md)
- [FEAT-0612](FEAT-0612-adopt-the-button-primitive-in-journal-and-window-frames.md)
- [FEAT-0615](FEAT-0615-add-magnetic-snapping-and-edge-tiling-for-windows.md)
