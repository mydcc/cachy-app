---
id: FEAT-0612
title: Adopt the button primitive in the journal and the window frames
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
depends_on: [FEAT-0609]
---

# FEAT-0612 — Adopt the button primitive in the journal and the window frames

The last adoption area: the journal, its tab strip, and the chrome every
window shares.

## Problem

`DashboardNav.svelte` (81 lines) is not the app navigation — it is the
journal's deep-dive preset strip (`performance | quality | direction |
discipline | costs`), rendered as `px-4 py-2 rounded-t-lg` with a `border-b-2`
active marker and icons injected through `{@html DOMPurify.sanitize(preset.icon)}`.
Its default presets are defined inline in the props with `|| "English"` label
fallbacks.

`WindowFrame.svelte` is 1373 lines and renders the minimise, maximise, close,
pin and context-menu controls that every window in the app carries. Those
controls are the most-repeated buttons in the codebase and the least
standardised.

Two notes. The `{@html}` icon path is a sanitisation boundary and must not
change in a styling item. And the window frame buttons must stay compatible
with whatever [FEAT-0615](FEAT-0615-add-magnetic-snapping-and-edge-tiling-for-windows.md)
adds — a snapping gesture is a pointer interaction on the same surface.

## Proposal

Migrate the journal's buttons and the window frame chrome to the primitive.

Where a frame control cannot be a normal button — because it must sit in a
drag handle, or must not intercept the drag gesture — record why, and keep it
as it is.

## Acceptance criteria

- [ ] Every `<button>` in the journal tree renders through `Button.svelte` or
      carries a naming comment
- [ ] `DashboardNav`'s preset strip renders through the tab-bar component
      decided in [FEAT-0606](FEAT-0606-harmonize-settings-hierarchy-and-tab-naming.md),
      or states why a journal-local strip may differ
- [ ] The `DOMPurify.sanitize` icon path is unchanged; the sanitisation test
      that covers it still passes
- [ ] `DashboardNav`'s inline default-preset labels come from i18n; the
      `|| "English"` fallbacks are gone
- [ ] `WindowFrame.svelte`'s chrome controls render through `Button.svelte`,
      except any that must not intercept a drag gesture — each such exception
      carries a comment saying so
- [ ] Every existing window implementation's test passes unmodified
- [ ] `WindowFrame.svelte` is still under the project's file-size ceiling after
      this change, or the size is justified in the PR description
- [ ] Windows open, drag, maximise, minimise, pin and close with no
      behavioural change

## Out of scope

- Adding snapping, tiling or any new window control. That is FEAT-0615.
- Consolidating the window flags, which is
      [FEAT-0614](FEAT-0614-consolidate-window-flags-and-resolve-the-double-click-drift.md).
- Changing the icon set or the sanitiser.
- Migrating buttons in the SEO pages.

## Open questions

- `WindowFrame.svelte` at 1373 lines is the largest single UI file in the
  repository. Splitting the chrome out of it is a refactor nobody has asked
  for. Should this item do it, or file it separately?

## Links

- Evidence: [`assets/FEAT-0604/ui-zustandsaufnahme.md`](../assets/FEAT-0604/ui-zustandsaufnahme.md) §2 and §5.1
- `src/components/shared/windows/WindowFrame.svelte`
- `src/components/shared/DashboardNav.svelte`
- [FEAT-0609](FEAT-0609-extend-and-adopt-the-button-primitive.md)
- [FEAT-0614](FEAT-0614-consolidate-window-flags-and-resolve-the-double-click-drift.md)
- [FEAT-0615](FEAT-0615-add-magnetic-snapping-and-edge-tiling-for-windows.md)
