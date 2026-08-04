---
id: BUG-0051
title: SidePanel.svelte is never rendered, so the "Enable Side Panel" setting does nothing
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: ADR-0006
depends_on: []
---

# BUG-0051 — SidePanel.svelte is never rendered, so the "Enable Side Panel" setting does nothing

## Symptom

Settings → Visuals has a toggle labelled "Enable Side Panel"
(`VisualsTab.svelte:610`, `settingsState.enableSidePanel`). Turning it on has no
visible effect. No AI panel, notes panel or chat panel appears anywhere in the
app.

## Evidence

**Demonstrated by absence, not by running the app**: `grep -rn "SidePanel"
src/routes src/components` finds `SidePanel.svelte` itself and nothing that
imports it. `grep -rln "from.*SidePanel"` across `src/` returns no result at
all — no route, no layout, no other component references it. Its children
(`AiPanel.svelte`, `NotesPanel.svelte`, `ChatPanel.svelte` under
`src/components/shared/sidepanel/`) are consequently unreachable too.

`SidePanel.svelte` itself is fully wired for the case where it *is* mounted: it
reads `settingsState.enableSidePanel` to guard its render (`SidePanel.svelte:267`),
consumes `chatState`, `notesState`, `aiState`, `settingsState.panelState` and
`floatingWindowsStore`, and its drag/resize logic (`interactjs`) is intact. This
is not a half-built feature — it is a complete one with its mount point missing.

`git log --oneline -- src/components/shared/SidePanel.svelte` shows only
mechanical type-refactor commits touching the file, nothing that would explain
an intentional removal of its render point. The cause of the disconnection is
not established from history alone.

## Cause

Unknown. Either a `<SidePanel />` usage was removed from a layout or route
during a refactor without removing the component, its store, or the setting
that controls it, or the component was built and never wired in. Both are
plausible; nothing in the repository states which.

## Fix

Not proposed here — this item exists to record the observation and block
[`FEAT-0046`](../features/FEAT-0046-sidepanel-onto-window-manager.md), which
was written on the assumption that the SidePanel is a live, reachable surface
competing for stacking order with the window manager. It currently is not, so
migrating its stacking and drag code onto the window manager would move dead
code rather than fix a user-visible defect.

The actual fix depends on a decision this repository's process reserves for a
human: does the side panel come back (add the missing render point,
`<SidePanel />` in `+layout.svelte` or `+page.svelte`, gated by
`enableSidePanel` as the component already expects), or is the feature retired
(remove `SidePanel.svelte`, `src/components/shared/sidepanel/`,
`src/stores/floatingWindows.svelte.ts`, the `enableSidePanel` setting and its
`VisualsTab.svelte` control, and the `interactjs` dependency)?

## Acceptance criteria

- [ ] A decision is recorded here on which of the two paths above is taken
- [ ] If restored: toggling "Enable Side Panel" shows the panel, and its three
      sub-panels (AI, Notes, Chat) render
- [ ] If retired: `grep -rn "SidePanel\|floatingWindowsStore" src` returns
      nothing, the setting and its UI control are gone, and `interactjs` is
      removed from `package.json`
- [ ] `FEAT-0046`'s `depends_on` is satisfied or the item is rewritten to match
      the decision

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
- [`FEAT-0046`](../features/FEAT-0046-sidepanel-onto-window-manager.md) — blocked by this item
- `src/components/shared/SidePanel.svelte:267`
- `src/components/settings/tabs/VisualsTab.svelte:610`
- `src/stores/settings.svelte.ts:181,362,587`
