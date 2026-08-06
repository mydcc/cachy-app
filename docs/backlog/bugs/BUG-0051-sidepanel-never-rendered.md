---
id: BUG-0051
title: SidePanel.svelte is never rendered, so the "Enable Side Panel" setting does nothing
type: bug
status: done
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

## Decision

**Restored.** The user confirmed the side panel is a feature they want kept
and brought back, not retired.

## Fix

`<SidePanel />` was missing from every route's render tree. Added it to
`src/routes/+layout.svelte` alongside the other always-mounted global overlays
(`WindowContainer`, `ToastContainer`, `GlobalTracker`, `FXOverlay`), matching
where the component already expected to live: it self-gates on
`settingsState.enableSidePanel` (`SidePanel.svelte:267`), so mounting it has no
effect for the default-off setting and only appears once a user opts in.

No changes to `SidePanel.svelte` itself, `floatingWindowsStore`, or any of its
sub-panels — the component was complete, only unreachable.

## Acceptance criteria

- [x] A decision is recorded here on which of the two paths above is taken
- [x] If restored: toggling "Enable Side Panel" shows the panel, and its three
      sub-panels (AI, Notes, Chat) render — verified with Playwright against
      the dev server: the floating trigger opens the AI Assistant panel, the
      header's mode-switch buttons (`title="My Notes"`, `title="Global Chat"`)
      correctly swap to each sub-panel with no console/page errors, and
      dragging the panel by its header changes its position
- [ ] If retired: *(not applicable — restored, not retired)*
- [x] `FEAT-0046`'s `depends_on` is satisfied or the item is rewritten to match
      the decision — `depends_on` no longer needs `BUG-0051`; updated there

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md)
- [`FEAT-0046`](../features/FEAT-0046-sidepanel-onto-window-manager.md) — blocked by this item
- `src/components/shared/SidePanel.svelte:267`
- `src/components/settings/tabs/VisualsTab.svelte:610`
- `src/stores/settings.svelte.ts:181,362,587`
