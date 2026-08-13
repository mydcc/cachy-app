---
id: FEAT-0045
title: Register the Trading Academy as its own window type
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: ADR-0006
depends_on: [FEAT-0044]
estimate: 8
size: XL
target_date: 2026-10-24
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

- [x] `academy` is a registered `WindowType` with its own registry config —
      `WindowRegistry.svelte.ts`'s `academy` entry: `allowMaximize`,
      `allowMinimize`, `canMinimizeToPanel`, `centerByDefault`,
      `isResponsive`/`edgeToEdgeBreakpoint: 768`, default layout 1200×800
      (same 3:2 ratio as the old `modal-size-instructions` preset)
- [x] The Academy can be minimised to the dock and restored with its geometry
      — verified live via Playwright (minimize, dock item appears, double-click
      restores)
- [x] Its size and position survive a page reload — required adding an
      `academy` case to `WindowManager.createFromData()` (session
      rehydration), the same mechanism `chart`/`channel`/`iframe` already
      use; `academy` was the only real-window type missing it. Verified live:
      dragged the window, reloaded, position was pixel-identical
- [x] Escape closes it through the window manager, not through a `ModalFrame`
      fallback — `+page.svelte`'s `handleKeydown` now calls
      `windowManager.close("academy")` directly (the id is real now, not the
      always-false check FEAT-0044 found); verified live
- [x] `uiState.showAcademyModal` and `toggleAcademyModal` no longer exist, and
      `grep -rn "showAcademyModal" src` is empty — confirmed, both the
      `$state` field and the two `UiSnapshot`/`update()` copies removed
- [x] The SEO route at `/academy` still opens it — unaffected by this item;
      that route never used `AcademyModal`/`uiState` (it's a fully standalone
      static page reusing `ChartPatternsView`/`CandlestickPatternsView`
      directly). Verified live: `/academy` still returns 200 and renders
- [x] `chatpanel` is either removed from the union or given a registry entry
      and a caller — removed (zero registry entry, zero caller anywhere)
- [x] `ContentWindow.svelte.ts` is either wired up or removed, and
      `docs/TODO.md` item 8 is updated to match — removed. It was
      structurally identical to `ModalWindow` (fixed `windowType: 'window'`
      plus unused `options.props` forwarding) with zero callers in the
      codebase's history; `ModalWindow`/`IframeWindow` already cover every
      case that was ever actually used

## Out of scope

The Academy's internal layout ([`BUG-0047`](../bugs/BUG-0047-academy-unusable-on-mobile.md))
and its glassmorphism contrast ([`BUG-0048`](../bugs/BUG-0048-glass-removes-academy-sidebar-background.md)).
Doing the same for the Market Dashboard — it works fine as a generic modal once
FEAT-0044 lands, and there is no evidence users want to minimise it.

## Open questions

~~Whether removing `ContentWindow` counts as defensive deletion under
`CLAUDE.md`.~~ Resolved: removed. Its purpose was fully clear (a generic
component-window wrapper) and it had zero callers in the entire time it
existed unreferenced — this isn't the "purpose unclear" case the rule
guards against, and `docs/TODO.md` item 8 records the reasoning.

## Verification

New files: `src/lib/windows/implementations/AcademyWindow.svelte.ts` (a
minimal `WindowBase` subclass — just `windowType: "academy"` and a
`component` getter) and `src/components/shared/AcademyContent.svelte` (the
tab-switching view, moved out of the deleted `AcademyModal.svelte` verbatim
except for the `ModalFrame` wrapper it used to render through and root-level
padding it now applies itself, matching how other content views like
`JournalContent.svelte` pad themselves rather than relying on a wrapper).
`WindowManager.openAcademy()` opens or focuses it (dynamically imported, like
`ChartWindow`/`ChannelWindow`, since `AcademyContent` pulls in the pattern
views).

Removing Academy as a `ModalFrame` caller left the `modal-size-instructions`
sizing special-case in `ModalFrameWindow.svelte.ts` (added for exactly this
caller in FEAT-0044) with no caller left to exercise it — removed rather than
kept as speculative dead code, since it was purpose-built for this one caller
weeks-old, not long-standing code someone might depend on.

`npm run check` and `npm test` are green (958 passed, 6 skipped, no
regressions; 10 new tests: `AcademyWindow.test.ts` covering its registry-driven
flags, `WindowManager.test.ts`'s `openAcademy` block covering dedup-by-id and
closing). Verified end-to-end against the dev server with Playwright: Academy
opens as a real window with no dimming backdrop, minimizes to the dock and
restores via double-click, its dragged position survives a full page reload
byte-for-byte, Escape closes it, it still goes edge-to-edge at a 390px
viewport, and the static `/academy` SEO route still returns 200 and renders
the pattern tabs untouched.

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
- [`docs/TODO.md`](../../TODO.md) item 8
- `src/lib/windows/implementations/AcademyWindow.svelte.ts`,
  `src/components/shared/AcademyContent.svelte`
- `src/lib/windows/types.ts`, `src/lib/windows/WindowRegistry.svelte.ts`
- `src/lib/windows/WindowManager.svelte.ts` — `openAcademy()`, the `academy`
  case in `createFromData()`
- `src/components/shared/LeftControlPanel.svelte`, `src/routes/+page.svelte`
- `src/stores/ui.svelte.ts`
