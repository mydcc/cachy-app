---
id: FEAT-0607
title: Harmonize the settings vocabulary, placement, hierarchy and tab naming
type: feature
status: ready
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0605
data_class: none
adr: none
depends_on: [FEAT-0605]
---

# FEAT-0607 — Harmonize the settings vocabulary, placement, hierarchy and tab naming

The settings were built tab by tab and the tabs do not agree with each other —
neither in structure, nor in words, nor in what lives where. This item makes
them agree before anything is added to them — in particular before a density
control is added, which would otherwise become a ninth inconsistency.

The work runs in three phases with a fixed order: **vocabulary first,
placement second, structure in parallel.** Renaming reveals misplacements, so
the words come before the audit; the tab-bar structure is independent of both
and runs alongside.

## Problem

Six concrete disagreements:

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

5. **The vocabulary is inconsistent and has gaps.** Tab labels, section
   headers and toggle texts use different words for the same thing, and some
   concepts have no settled term at all. There is no stated word list, so every
   author invents their own. The structure of a mature trading UI (chart style,
   trading, confirmation, layout, alert configuration, notification, display)
   is a useful orientation for which words exist — orient, do not copy.

6. **Nobody checked whether content sits in the right tab.** Settings landed
   where there was space when they were written. Whether each setting lives in
   the tab a user would look in has never been audited.

There is also no stated grouping. Eight tabs split by nothing in particular
means the user has to know which tab owns which setting.

## Proposal

**Phase 1 — vocabulary.** Decide one word list for tab labels, section headers
and toggle texts, in both `de.json` and `en.json`, and apply it. Inconsistent
terms are renamed; gaps get a settled term. The reference structure above
informs which words exist; no product is copied and no third-party
screenshots enter this repository — behaviour is described, not reproduced.

**Phase 2 — placement.** Audit every setting against the vocabulary: which tab
a user would look in, and which tab it is in. The result is a placement table.
Pure moves (same control, different tab, no behaviour change) happen in this
item. Anything that needs a tab split or merge is filed as a follow-up item,
not done here.

**Phase 3 — structure, parallel to both.** Decide and document one tab and
sub-tab model, then make the eight existing tabs conform:

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
[FEAT-0614](FEAT-0614-introduce-compact-default-and-wide-density-modes.md).

## Acceptance criteria

- [ ] A vocabulary table exists: every tab label, section header and toggle
      text in its settled term, DE and EN, with the renamed terms listed
- [ ] No tab label is a literal string; the `cloud` label comes from i18n
- [ ] No label uses an `|| "English"` fallback; a missing key fails the
      i18n check instead of rendering English
- [ ] A placement table covers every setting: current tab, expected tab, and
      match or mismatch
- [ ] Every mismatch that is a pure move is moved in this item; every mismatch
      that needs a tab split or merge is filed as a follow-up item and linked
      here
- [ ] One tab-bar component exists and is used by `SettingsContent` and by
      `VisualsTab`
- [ ] Tab content renders from the tab array, not from an `{#if}` chain
- [ ] The sub-tab decision is written down in the component docblock: reuse or
      removal, with the reason
- [ ] A grouping of the eight tabs is decided and recorded; if grouping by
      grouping, it is recorded as out of scope here rather than left implicit
- [ ] Where the density control will live is decided and recorded, so
      FEAT-0614 does not have to choose again
- [ ] Both `de.json` and `en.json` carry any new keys

## Out of scope

- Tab splits or merges. The placement audit finds them; follow-up items do
  them. Users who bookmarked a mental model get it back until then.
- The grid and column work, which is
  [FEAT-0608](FEAT-0608-make-settingsgrid-the-only-grid-pattern-in-settings.md).
- Adding the density control itself.
- Touching the 2166-line settings store beyond what a new i18n key requires.
- ARIA roles and keyboard navigation for the tab bars, which FEAT-0605's N8
  measures first. If that check finds them missing, it is filed as a `BUG`.
- Third-party interface screenshots in this repository. Only our own material;
  reference behaviour is described, not reproduced.

## Open questions

- Should the tab bar move from a left rail to a top bar? The rail costs
  `md:w-52` of a settings window that is itself resizable, and the density work
  makes horizontal space scarcer. Changing it is a visible change to every
  existing user, so it needs a decision rather than a side effect.
- Should the density control live under Visuals → Layout (where the other
  display preferences already are) or get its own tab?
- Does the placement audit change the tab count? If a tab should split or two
  tabs should merge, that decision belongs to the follow-up item, not here.

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §3.1
- [FEAT-0605](FEAT-0605-ui-status-quo-audit.md)
- [FEAT-0608](FEAT-0608-make-settingsgrid-the-only-grid-pattern-in-settings.md) — next in this track
- [FEAT-0614](FEAT-0614-introduce-compact-default-and-wide-density-modes.md) — needs this first
- [BUG-0601](../bugs/BUG-0601-hardcoded-duration-bucket-labels.md)
- [BUG-0602](../bugs/BUG-0602-hardcoded-dataset-labels.md)
