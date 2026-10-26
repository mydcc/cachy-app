---
id: FEAT-0733
title: Migrate the header journal entry to the entry-point registry
type: feature
status: done
assignee: opencode
branch: feature/feat-0733-header-registry
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0731, FEAT-0732]
---

# FEAT-0733 — Migrate the header journal entry to the entry-point registry

## Problem

The main header still declares its journal destination twice, once per
breakpoint:

- `#journal-toggle-btn` in the title row (`md:hidden`), a plain button with
  its own label keys, telemetry and `uiState.toggleJournalModal(true)` call;
- `#view-journal-btn-desktop` in the action cluster (`hidden md:block`), a
  `Button` with the same keys and open call but a different telemetry name.

Both copy the label keys by hand and call the store directly, so either copy
can drift from the registry and from the other. The registry already carries a
`header` placement for `journal` (`header(10)`, always visible), but the header
does not read it.

This is step 3 of the FEAT-0618 migration. It changes the header journal
destination only; the preset, reset and theme actions stay where they are.

## Proposal

- Extract the two responsive variants into one component
  (`HeaderJournalButton.svelte`) that renders the same registry entry for both
  breakpoints.
- Read the header entries through `getSurfaceEntries("header", context)`; the
  header's only placement is `journal`, always visible.
- Take the text, title and `aria-label` from the entry's label keys and open
  through the existing `openEntry` adapter.
- Keep both ids (`#journal-toggle-btn`, `#view-journal-btn-desktop`); the
  onboarding tour targets them.
- Keep the two telemetry names (`ViewJournalMobile`, `ViewJournalDesktop`);
  they are variant metadata, not destination data.

The journal opener keeps its two existing behaviours in one place: a minimized
journal is restored (the rail shortcut's case), otherwise the header toggles it
open or closed. Before this step the header closed a minimized journal instead
of restoring it; that single edge is normalised to the rail's behaviour.

## Acceptance criteria

- [x] The header renders exactly the registry's `header` placements: the
      `journal` entry, in both the mobile and the desktop variant.
- [x] Text, title and `aria-label` come from the entry's label keys;
      `+page.svelte` has no literal `app.journalButton`/`app.journalButtonTitle`
      for the header destination and does not call `toggleJournalModal` for it.
- [x] `#journal-toggle-btn` and `#view-journal-btn-desktop` still exist, keep
      their breakpoint wrappers and their accessible names.
- [x] Clicking the header control opens the journal when closed, closes it
      when open, and restores it when minimized.
- [x] Telemetry event names are unchanged.
- [x] The preset loader, save/delete, reset and theme switch are untouched.
- [x] Component tests cover both variants, their labels and the opener wiring;
      adapter tests cover the journal restore/toggle split and the other
      opener kinds.
- [x] No rail, journal-strip or settings-rail behavior changes.

## Progress

`HeaderJournalButton.svelte` renders the registry's `header` placement in both
responsive copies. `+page.svelte` builds a condition-free `EntryContext` (the
header carries only the always-visible journal placement) and iterates
`getSurfaceEntries("header", context)`; the literal label keys and the direct
`toggleJournalModal` call are gone from the header. Both ids stay, because the
onboarding tour targets them.

The journal branch in `openEntry` now covers both old handlers: a minimized
journal is restored, otherwise `uiState.toggleJournalModal(true)` opens it when
closed and closes it when open. The one intended delta is a minimized journal
clicked from the header: it used to be closed, now it is restored, matching the
rail shortcut.

Tests: 5 `HeaderJournalButton` component cases (both variants, labels, mobile
open, desktop restore, non-journal rejection) and 10 `openEntry` adapter cases
(all window, toggle and error branches, including the instance-id guard). The
registry test suite additionally pins that the header placement stays
context-free, because the header's entry context is static. Targeted tests,
ESLint and `npm run check` pass; the preset, reset and theme actions are
untouched.

## Out of scope

- Migrating the journal tab strip or the settings rail.
- Extracting or restyling the rest of the header action cluster.
- Changing the journal window, its tabs or its persistence.
- Fixing BUG-0715 (hidden rail preconditions).

## Open questions

None blocking. The minimized-header edge above is the only intended behavior
delta and is documented in the proposal.

## Links

- Spec: [`assets/FEAT-0618/entry-point-registry.md`](../assets/FEAT-0618/entry-point-registry.md)
- Previous steps: [`FEAT-0731`](FEAT-0731-entry-point-registry-data-and-resolver.md),
  [`FEAT-0732`](FEAT-0732-migrate-left-rail-to-entry-point-registry.md)
- `src/routes/+page.svelte`
- `src/lib/navigation/entry-points.ts`
- `src/lib/navigation/open-entry.ts`
- `src/lib/onboarding/steps.ts` (targets both ids)
