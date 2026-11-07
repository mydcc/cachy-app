---
id: FEAT-0821
title: Give paper trading and the risk limits one home in Settings
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: refactor/settings-remove-automation-tab
---

# FEAT-0821 — Give paper trading and the risk limits one home in Settings

## Problem

The Automation tab repeated two settings that another tab already owns, and
opened with a paragraph that describes history rather than a setting:

- `AutomationTab` rendered `<PaperTradingSettings />` (`AutomationTab.svelte:80`)
  while Trading & Market → Paper Trading renders the same component
  (`TradingTab.svelte:773`).
- It rendered `<RiskLimitsSettings />` (`AutomationTab.svelte:81`) while
  Risiko & Kill Switch renders the same component (`TradingTab.svelte:752`).
- Above both sat `settings.automation.botsMoved`, a paragraph explaining that the
  bots moved to Alerts & Bots.

No value goes out of sync — both render sites read the same store — but the same
switch has two doors. A trader looking for paper trading has no way to know the
other door exists, and there is no answer to which one the documentation,
the AI assistant or a support answer should name.

Taking the duplicates out answers the question on its own: the tab has nothing
of its own left, because the bots themselves already left it in FEAT-0749.

## Proposal

Delete the Automation rail tab. Paper trading stays under Trading & Market →
Paper Trading, the risk limits under Trading & Market → Risk & Kill Switch, and
the bots under Alerts & Bots in the rail.

Concretely:

- Remove the `settings.automation` entry from the settings rail registry
  (`src/lib/navigation/entry-points.ts`) and its body from
  `SettingsContent.svelte`.
- Delete `AutomationTab.svelte` and its component test, plus the now unused
  `settings-automation` icon.
- Drop `settings.automation.botsMoved`, `settings.automation.title`,
  `settings.automation.openBots`, `settings.automation.account` and
  `settings.tabs.automation` from `de.json` and `en.json`. The rest of the
  `settings.automation.*` namespace stays: the bots surface uses it.
- Regenerate `src/locales/schema.d.ts` with `npm run i18n:types`.
- Fall back to the first tab when `uiState.settingsTab` names a tab that no
  longer exists, so a remembered id cannot render an empty panel.
- Pin the outcome with `src/components/settings/settingsSectionPlacement.test.ts`:
  `PaperTradingSettings` and `RiskLimitsSettings` are rendered from exactly one
  file each.

## Acceptance criteria

- [x] The settings rail has seven tabs; `automation` is not among the registry
      ids, and `settings-tabs.test.ts`, `SettingsTabBar.component.test.ts` and
      `surface-scan.test.ts` agree.
- [x] `<PaperTradingSettings />` and `<RiskLimitsSettings />` each appear in
      exactly one file under `src/components/settings`, and the test fails when
      a second render site is added.
- [x] `settings.automation.botsMoved` no longer exists in `de.json` or
      `en.json`; DE and EN have the same key set.
- [x] A remembered `uiState.settingsTab` naming a removed tab renders the first
      tab instead of a blank panel.
- [x] The bots remain reachable: the rail's Alerts & Bots entry is unchanged and
      the `settings.automation.*` keys the bots surface reads are untouched.
- [x] `npm run check` is green (delegated to CI, per AGENTS.md).

## Out of scope

Three other structural findings from the same review are deliberately not part
of this item; each needs its own decision:

- "Risk & Kill Switch" bundles risk limits, confirmations, notifications and
  external channels in one sub-tab (rationale in FEAT-0024/FEAT-0025).
- "Data & Market" holds the technicals display toggles
  (`showTechnicalsSummary`/`Oscillators`/`MAs`/`Pivots`) next to data limits.
- Settings have no search box (FEAT-0022, still an idea).

## Open questions

None.

## Links

- `src/components/settings/tabs/TradingTab.svelte` — the remaining home for both
  panels.
- `src/components/settings/PaperTradingSettings.svelte`,
  `src/components/settings/RiskLimitsSettings.svelte`
- FEAT-0749 — moved the bots out of the Automation tab.
- FEAT-0735 — registry-driven settings rail.
