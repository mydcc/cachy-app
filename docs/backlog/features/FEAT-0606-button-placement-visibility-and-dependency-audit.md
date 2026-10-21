---
id: FEAT-0606
title: Audit button placement, visibility and enablement dependencies
type: feature
status: done
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0605
data_class: none
adr: none
depends_on: [FEAT-0605]
assignee: opencode
branch: docs/feat-0606-button-audit
---

# FEAT-0606 — Audit button placement, visibility and dependencies

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

- [x] A table covers every interactive control in the app shell, settings,
      journal and window frames, with columns: surface, control, action, enabling
      state, is-that-state-visible
- [x] Every "enabling state is not visible" case is filed as a `BUG` item with
      `area: ui` and linked from this item
- [x] Every control that acts on a different surface than it appears on is
      called out explicitly
- [x] The destructive controls (`#reset-btn`, `#delete-preset-btn`, and any
      other) are listed together with how each is confirmed or not confirmed
- [x] `#save-preset-btn` / `#delete-preset-btn` / `#preset-loader` are checked
      against each other for consistency and the result recorded
- [x] The table is added to
      [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md)
      as a new section, not as a separate document

## Out of scope

- Moving, restyling, or removing any button. This item only measures.
- Button primitive adoption, which is [FEAT-0610](FEAT-0610-extend-and-adopt-the-button-primitive.md)
  onward.
- Changing any enablement logic.
- Iconography, labels, and i18n of button text.

## Resolved question

The open question asked whether popovers and dropdowns belong in the table.
Answer recorded in §8: always-visible surfaces are exhaustive; a popover is
included only where it carries a destructive or money-relevant control (preset
loader, account switcher, provider manager, column settings). The symbol picker
is excluded — it is a search surface with no state of its own. This keeps the
table bounded without dropping the controls where a hidden precondition costs
something.

## Progress — 2026-10-21

Branch `docs/feat-0606-button-audit`. Snapshot `develop` at `8fcbcd251`.

§8 of the audit asset now lists 206 interactive controls in the four surfaces
(204 `<button>` source occurrences, the preset select and the window title's
`role="button"`), with enabling state and visibility per control, plus the
destructive-control table, the preset-trio comparison and the cross-surface
list. Split: 106 settings, 45 app shell, 40 journal, 13 window frames.

Eight defects were filed from it, each with file:line evidence:

- BUG-0712 — window zoom and font controls never disable at their bounds
- BUG-0713 — "Add feed" disables at five with no visible reason
- BUG-0714 — remove-account's reason lives in a `title` on a disabled button
- BUG-0715 — rail toggles can stay lit while their panel is not rendered
- BUG-0716 — header reset and delete-preset act without confirmation
- BUG-0717 — window titles carry button semantics where the title does nothing
- BUG-0718 — the last calculation-timeframe toggle stays enabled and refuses
- BUG-0719 — journal sync disables on `uiState.isLoading` with no cue

No button was moved, restyled or re-wired: the item measured, as its out-of-scope
clause requires. The observations that did not merit their own item (dead
`SettingsButton`, duplicated news-behaviour control, undiscoverable right-click
theme gesture, last-timeframe no-op, quick-date feedback) are recorded at the end
of §8.8 so FEAT-0607/0610 do not rediscover them.

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §8 (this audit) and §5 (button counts)
- [FEAT-0605](FEAT-0605-ui-status-quo-audit.md)
- [FEAT-0610](FEAT-0610-extend-and-adopt-the-button-primitive.md) — consumes this
- Filed from this audit: [BUG-0712](../bugs/BUG-0712-window-zoom-controls-stay-enabled-at-limits.md),
  [BUG-0713](../bugs/BUG-0713-add-feed-cap-has-no-visible-reason.md),
  [BUG-0714](../bugs/BUG-0714-account-remove-reason-is-hover-only.md),
  [BUG-0715](../bugs/BUG-0715-sidebar-toggles-act-on-hidden-surfaces.md),
  [BUG-0716](../bugs/BUG-0716-header-destructive-buttons-have-no-confirmation.md),
  [BUG-0717](../bugs/BUG-0717-window-title-announces-as-a-button-when-it-is-not.md),
  [BUG-0718](../bugs/BUG-0718-last-timeframe-toggle-stays-enabled.md),
  [BUG-0719](../bugs/BUG-0719-sync-disables-on-loading-without-a-cue.md)
- [BUG-0410](../bugs/BUG-0410-mode-state-must-not-depend-on-sidebar.md)
- [BUG-0412](../bugs/BUG-0412-duplicate-sidebar-account-fetch-race.md)
- [BUG-0423](../bugs/BUG-0423-coalesce-duplicate-account-fetches.md)
