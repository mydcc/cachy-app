---
id: FEAT-0605
title: Audit button placement, visibility and enablement dependencies
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

# FEAT-0605 — Audit button placement, visibility and dependencies

There are 364 raw `<button>` elements across 167 files and sixteen uses of the
shared `btn-*` utility classes. Before adopting a button primitive, it is worth
knowing which buttons *should* exist, where they should sit, and which of them
are correctly disabled.

## Problem

A button primitive fixes how a button looks. It does not answer whether a
button should be on screen at all, in that group, or enabled. Those are
separate questions and they are currently unasked:

- Some buttons are gated behind visibility flags that differ from the state
  they depend on. `BUG-0410` (mode state must not depend on sidebar) and
  `BUG-0412` / `BUG-0423` (duplicate sidebar account fetch) are all instances
  of layout state and data state being wired together in ways that surprise.
- The main header cluster mixes four concerns — presets (data), theme
  (preference), reset (destructive), journal (navigation) — in one flex row
  with no grouping.
- `disabled` states exist ad hoc. The correct precedent,
  `#delete-preset-btn disabled={!presetState.selectedPreset}`, is the only one
  that is obviously deliberate; the rest need the same review.

Migrating 364 buttons to a primitive before knowing this produces a
consistently styled set of controls that are still arranged wrongly.

## Proposal

Produce a table of every interactive control in the app shell, the settings
window, the journal and the window frames, recording for each: where it lives,
what it acts on, what state enables it, and whether that state is visible to
the user at the moment the button is.

File every finding that is a defect as its own `BUG` item, so the fixes are not
hidden inside a styling change.

## Acceptance criteria

- [ ] A table covers every interactive control in the app shell, settings,
      journal and window frames, with columns: surface, control, action, enabling
      state, is-that-state-visible
- [ ] Every "enabling state is not visible" case is filed as a `BUG` item with
      `area: ui` and linked from this item
- [ ] Every control that acts on a different surface than it appears on is
      called out explicitly
- [ ] The destructive controls (`#reset-btn`, `#delete-preset-btn`, and any
      other) are listed together with how each is confirmed or not confirmed
- [ ] `#save-preset-btn` / `#delete-preset-btn` / `#preset-loader` are checked
      against each other for consistency and the result recorded
- [ ] The table is added to
      [`assets/FEAT-0604/ui-zustandsaufnahme.md`](../assets/FEAT-0604/ui-zustandsaufnahme.md)
      as a new section, not as a separate document

## Out of scope

- Moving, restyling, or removing any button. This item only measures.
- Button primitive adoption, which is [FEAT-0609](FEAT-0609-extend-and-adopt-the-button-primitive.md)
  onward.
- Changing any enablement logic.
- Iconography, labels, and i18n of button text.

## Open questions

- Should the audit cover controls inside popovers and dropdowns (symbol picker,
  preset loader, account switcher), or only always-visible surfaces? Including
  them roughly doubles the table.

## Links

- Evidence: [`assets/FEAT-0604/ui-zustandsaufnahme.md`](../assets/FEAT-0604/ui-zustandsaufnahme.md) §5
- [FEAT-0604](FEAT-0604-ui-status-quo-audit.md)
- [FEAT-0609](FEAT-0609-extend-and-adopt-the-button-primitive.md) — consumes this
- [BUG-0410](../bugs/BUG-0410-mode-state-must-not-depend-on-sidebar.md)
- [BUG-0412](../bugs/BUG-0412-duplicate-sidebar-account-fetch-race.md)
- [BUG-0423](../bugs/BUG-0423-coalesce-duplicate-account-fetches.md)
