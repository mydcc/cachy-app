---
id: FEAT-0607
title: Harmonize the settings vocabulary, placement, hierarchy and tab naming
type: feature
status: done
assignee: opencode
branch: docs/feat-0607-vocabulary-placement
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

2. **Sub-tabs existed as five hand-written copies, with a third style in a
   sixth place.** Trading, AI, Connections, System and Visuals each had their
   own pill row; the technicals category bar was an underline bar. That is a
   structural inconsistency, and a reader could not tell whether a flat tab
   was a decision or an omission.

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

- [x] A vocabulary table exists: every tab label, section header and toggle
      text in its settled term, DE and EN, with the renamed terms listed
- [x] No tab label is a literal string; the `cloud` label comes from i18n
- [x] No label uses an `|| "English"` fallback; a missing key fails the
      i18n check instead of rendering English
- [x] A placement table covers every setting: current tab, expected tab, and
      match or mismatch
- [x] Every mismatch that is a pure move is moved in this item; every mismatch
      that needs a tab split or merge is filed as a follow-up item and linked
      here
- [x] One tab-bar component exists and is used by `SettingsContent` and by
      `VisualsTab`
- [x] Tab content renders from the tab array, not from an `{#if}` chain
- [x] The sub-tab decision is written down in the component docblock: reuse or
      removal, with the reason
- [x] A grouping of the eight tabs is decided and recorded; if grouping by
      grouping, it is recorded as out of scope here rather than left implicit
- [x] Where the density control will live is decided and recorded, so
      FEAT-0614 does not have to choose again
- [x] Both `de.json` and `en.json` carry any new keys

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

## Decisions

- **Density control: Visuals → Layout.** It is a display preference like the
  other controls on that sub-tab, and a ninth top-level tab for one dropdown
  would make the rail longer without making the control easier to find. This
  is the answer FEAT-0614 depends on; the control itself stays out of this
  item.
- **One tab bar, two variants.** `TabBar.svelte` renders `variant="rail"` for
  the window navigation and `variant="pills"` for the sub-tabs. The two used
  to be independent markup with their own active-state treatment.
- **Sub-tabs stay.** Five settings tabs use them (Trading, AI, Connections,
  System, Visuals) plus the technicals category bar, and they are the same
  interaction as the rail. The decision and its reason are in the component
  docblock (AC8).
- **No grouping of the eight tabs in this item.** The rail stays flat and
  keeps its current order; a grouped rail is a visible change to every user
  and would need its own item. Recorded here rather than left implicit (AC9).
- **Rendering is data, not branches.** Both windows keep the tab list as the
  single source for navigation and content: a keyed `{#each}` with a dynamic
  component. A new tab is one entry plus its component.

## Progress — 2026-10-22: structure and i18n (first PR)

Branch `feature/feat-0607-settings-structure`. This closes the structural half
of the item; the vocabulary and placement tables follow separately.

- `TabBar.svelte` is the one tab-bar component. The window rail
  (`SettingsContent`, `variant="rail"`) and every sub-tab row
  (`variant="pills"`) render through it: Trading, AI, Connections, System,
  Visuals and the technicals category bar. Six hand-written bars became one
  component with two variants; the third language — the technicals underline
  bar — is gone. Both keep the ARIA tab pattern the rail already had; keyboard
  navigation stays untouched (FEAT-0605's N8 measures it first).
- The window-level panels render from the tab array (keyed `{#each}` + dynamic
  component), so a new tab is one entry plus its component. The six sub-tab
  bars share the component, but their panels are still inline markup behind
  `{#if}` branches: the array holds ids and labels, not components. Extracting
  five multi-hundred-line panels into components is a separate refactor and is
  **not** part of this item; AC7 is therefore met for the window-level content
  and explicitly not for sub-tab panels.
- Ten sub-tab labels in `TradingTab` and `SystemTab` carried the
  `$_("…") || "English"` idiom; they are gone, so no settings tab or sub-tab
  label hides a missing key. `settings.tabs.cloud` already existed, which made
  the `|| "Cloud"` dead weight.
- New keys: `settings.tabs.label`, `settings.visuals.subtabs.label` and
  `settings.{trading,ai,connections,system,technicals}.subTabLabel` — the
  `aria-label` of each tab list, DE and EN.
- `settingsTabs.test.ts` guards all six tab lists: the exact ids in order, every
  label key present in both locales (read from the source, not derived from the
  id), no fallback inside the tab array, and `<TabBar>` in every file. For the
  two array-rendered windows it also fails on a reinstated `{#if activeTab}`
  chain. `TabBar.component.test.ts` pins the component contract (order,
  selection, click id, variant classes).
- The two FEAT-0611 escape comments that named this item are gone from the
  five rails; the tab button inside `TabBar` carries its own escape comment and
  a pinned escape count, because it is navigation rather than an action button.

**Still open — the second PR:** the vocabulary table (AC1), the placement
table and the pure moves (AC4/AC5). The item stays `in-progress` until those
land.

## Progress — 2026-10-22: vocabulary and placement (second PR)

Branch `docs/feat-0607-vocabulary-placement`. The structural half shipped in
PR #4199; this half closes the item.

- **§10 Vokabular** in
  [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md)
  lists 67 section headers and 92 toggle labels with their DE/EN term and key,
  plus the six renamed terms (§10.3). The table is generated from the locale
  files through the usage sites, so a term that exists in only one language
  cannot hide.
- **§11 Platzierung** covers the same 67 sections: rendered tab, expected tab,
  verdict. The result is **no pure move**. The three deviations from the
  one-tab rule are documented in the code and recorded as intentional:
  `RiskLimitsSettings` and `PaperTradingSettings` are reused by Automation for
  the simulated account, and Confirmations, Notifications and External Channels
  share the Trading/Risk sub-tab (FEAT-0024/0025).
- **Six terms renamed** (DE/EN): Order-Audit-Trail → Order-Audit, Order-Log →
  Order-Audit, Anzeigeeinstellungen → Darstellung, „Kill switch" → „Kill
  Switch", API Quota Überwachung → API-Quota-Überwachung, Trade Flow
  Konfiguration → Trade-Flow-Konfiguration.
- **One key left the wrong namespace:**
  `settings.trading.indicatorConfiguration` → `settings.chart.indicatorConfiguration`
  — the header has been rendered by the Chart tab since the indicator settings
  moved, but the key still named Trading. Its `|| "Indicator Configuration"`
  fallback went with it.
- The tab-bar work from the first PR is unchanged; `settingsTabs.test.ts`
  keeps the six tab lists pinned.

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §3.1
- [FEAT-0605](FEAT-0605-ui-status-quo-audit.md)
- [FEAT-0608](FEAT-0608-make-settingsgrid-the-only-grid-pattern-in-settings.md) — next in this track
- [FEAT-0614](FEAT-0614-introduce-compact-default-and-wide-density-modes.md) — needs this first
- [BUG-0601](../bugs/BUG-0601-hardcoded-duration-bucket-labels.md)
- [BUG-0602](../bugs/BUG-0602-hardcoded-dataset-labels.md)
