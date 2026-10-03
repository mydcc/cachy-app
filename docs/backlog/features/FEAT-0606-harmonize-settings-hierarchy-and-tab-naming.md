---
id: FEAT-0606
title: Harmonize the settings hierarchy, tab naming and sub-tab pattern
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

# FEAT-0606 — Harmonize the settings hierarchy and tab naming

The settings were built tab by tab and the tabs do not agree with each other.
This item makes them agree before anything is added to them — in particular
before a density control is added, which would otherwise become a ninth
inconsistency.

## Problem

Four concrete disagreements:

1. **Two tab-bar languages in one window.** `SettingsContent` uses a left rail
   of `px-4 py-3` buttons with a `border-l-2` / `border-b-2` active marker.
   `VisualsTab` uses `px-3 py-1.5 text-xs rounded-lg` pills with a
   `bg-[var(--accent-color)]` active state. Both look like navigation, neither
   looks like the other.

2. **Sub-tabs exist in one tab only.** `VisualsTab` has appearance / layout /
   background. The other seven tabs are flat. That may be the right structure,
   but it is currently an accident rather than a decision, and a reader cannot
   tell whether the absence of sub-tabs elsewhere is intentional.

3. **One label is not translated.** The `cloud` tab label is the literal string
   `"Cloud"`; the other seven come from `$_("settings.tabs.*")` with an
   `|| "English"` fallback. German users see one English tab. This is the same
   class as BUG-0601 and BUG-0602.

4. **Adding a tab means editing three places.** The tab array, an `{#if}/
   {else if}` chain in the content area, and the i18n keys. There is no keyed
   `{#each}` with a dynamic component.

There is also no stated grouping. Eight tabs split by nothing in particular
means the user has to know which tab owns which setting.

## Proposal

Decide and document one tab and sub-tab model, then make the eight existing
tabs conform.

- One tab-bar visual language across the window, used for both the main rail
  and any sub-tab.
- The sub-tab pattern either generalised to a reusable component or removed.
  Whichever is chosen, `VisualsTab` is the only current user and there are
  exactly three sub-tabs, so a reusable component is only justified if a second
  caller appears in this item.
- Every tab label from `$_()` with no hardcoded fallback string. The `|| "English"`
  idiom hides a missing key behind a plausible label; the i18n check in CI is
  the thing that should catch it.
- Tab content rendered from the tab array via a keyed `{#each}` and a dynamic
  component, so a new tab is one entry plus one component.

This item also hosts the density control's *placement* decision — which tab it
belongs in — without implementing it. That is
[FEAT-0613](FEAT-0613-introduce-compact-default-and-wide-density-modes.md).

## Acceptance criteria

- [ ] One tab-bar component exists and is used by `SettingsContent` and by
      `VisualsTab`
- [ ] The `cloud` tab label comes from i18n; no tab label is a literal string
- [ ] No tab label uses an `|| "English"` fallback; a missing key fails the
      i18n check instead of rendering English
- [ ] Tab content renders from the tab array, not from an `{#if}` chain
- [ ] The sub-tab decision is written down in the component docblock: reuse or
      removal, with the reason
- [ ] A grouping of the eight tabs is decided and recorded; if grouping by
      grouping, it is recorded as out of scope here rather than left implicit
- [ ] Where the density control will live is decided and recorded, so
      FEAT-0613 does not have to choose again
- [ ] Both `de.json` and `en.json` carry any new keys

## Out of scope

- Moving settings between tabs. Users who bookmarked a mental model get it
  back; reorganisation is a separate, larger decision.
- The grid and column work, which is
  [FEAT-0607](FEAT-0607-make-settingsgrid-the-only-grid-pattern-in-settings.md).
- Adding the density control itself.
- Touching the 2166-line settings store beyond what a new i18n key requires.
- ARIA roles and keyboard navigation for the tab bars, which FEAT-0604's N8
  measures first. If that check finds them missing, it is filed as a `BUG`.

## Open questions

- Should the tab bar move from a left rail to a top bar? The rail costs
  `md:w-52` of a settings window that is itself resizable, and the density work
  makes horizontal space scarcer. Changing it is a visible change to every
  existing user, so it needs a decision rather than a side effect.
- Should the density control live under Visuals → Layout (where the other
  display preferences already are) or get its own tab?

## Links

- Evidence: [`assets/FEAT-0604/ui-zustandsaufnahme.md`](../assets/FEAT-0604/ui-zustandsaufnahme.md) §3.1
- [FEAT-0604](FEAT-0604-ui-status-quo-audit.md)
- [FEAT-0607](FEAT-0607-make-settingsgrid-the-only-grid-pattern-in-settings.md) — next in this track
- [FEAT-0613](FEAT-0613-introduce-compact-default-and-wide-density-modes.md) — needs this first
- [BUG-0601](../bugs/BUG-0601-hardcoded-duration-bucket-labels.md)
- [BUG-0602](../bugs/BUG-0602-hardcoded-dataset-labels.md)
