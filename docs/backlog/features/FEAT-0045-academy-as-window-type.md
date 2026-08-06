---
id: FEAT-0045
title: Register the Trading Academy as its own window type
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: ADR-0006
depends_on: [FEAT-0044]
---

# FEAT-0045 — Register the Trading Academy as its own window type

## Problem

The Academy is the surface a user keeps open longest and the one that benefits
most from being a real window: minimise it while checking a chart, come back to
the same pattern, keep the size chosen last session. As a `ModalFrame` it can do
none of that, and [`FEAT-0044`](FEAT-0044-modalframe-through-window-manager.md)
only gives it the generic `modal` behaviour — centred, not minimisable, not
persisted.

`uiState.showAcademyModal` (`src/stores/ui.svelte.ts:84`) is also a second
source of truth for whether the Academy is open, parallel to
`windowManager.isOpen()`. The dead Escape branch at `+page.svelte:203` exists
because someone already assumed the window manager owned it.

## Proposal

Add `academy` to the `WindowType` union and a config to `WindowRegistry` with
its own layout (roughly the current `80vw` / 3:2, capped at 1320px), plus
`allowMinimize`, `canMinimizeToPanel`, `persistent`, `isResponsive` and
`edgeToEdgeBreakpoint: 768`. Add an `AcademyWindow` implementation alongside the
existing ones in `src/lib/windows/implementations/`, with `AcademyModal`'s
current content as its view.

`uiState.showAcademyModal` and `toggleAcademyModal` are removed; the open/close
path becomes `windowManager.openAcademy()` / `close('academy')`. The callers are
`LeftControlPanel.svelte:82` and the SEO route at
`src/routes/[[lang]]/(seo)/academy/+page.svelte`.

The `academy_active_tab` key in `localStorage` (`AcademyModal.svelte:29-37`)
stays where it is — it is tab state, not window geometry, and window geometry
already has its own `cachy_win_academy` key.

While registering it: `chatpanel` is declared in the `WindowType` union
(`types.ts:190`) but has no registry entry and no caller anywhere. Remove it, or
say in the item why it stays. Same question for `ContentWindow.svelte.ts`, which
`docs/TODO.md` item 8 already records as unreachable.

## Acceptance criteria

- [ ] `academy` is a registered `WindowType` with its own registry config
- [ ] The Academy can be minimised to the dock and restored with its geometry
- [ ] Its size and position survive a page reload
- [ ] Escape closes it through the window manager, not through a `ModalFrame`
      fallback
- [ ] `uiState.showAcademyModal` and `toggleAcademyModal` no longer exist, and
      `grep -rn "showAcademyModal" src` is empty
- [ ] The SEO route at `/academy` still opens it
- [ ] `chatpanel` is either removed from the union or given a registry entry and
      a caller
- [ ] `ContentWindow.svelte.ts` is either wired up or removed, and
      `docs/TODO.md` item 8 is updated to match

## Out of scope

The Academy's internal layout ([`BUG-0047`](../bugs/BUG-0047-academy-unusable-on-mobile.md))
and its glassmorphism contrast ([`BUG-0048`](../bugs/BUG-0048-glass-removes-academy-sidebar-background.md)).
Doing the same for the Market Dashboard — it works fine as a generic modal once
FEAT-0044 lands, and there is no evidence users want to minimise it.

## Open questions

Whether removing `ContentWindow` counts as defensive deletion under `CLAUDE.md`.
Its purpose is documented but it has no caller; the decision belongs in
`docs/TODO.md` item 8, not here.

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
- [`docs/TODO.md`](../../TODO.md) item 8
- `src/components/shared/AcademyModal.svelte`, `src/stores/ui.svelte.ts:84,415-417`
- `src/lib/windows/types.ts:182-199`, `src/lib/windows/WindowRegistry.svelte.ts`
- `src/components/shared/LeftControlPanel.svelte:82`
