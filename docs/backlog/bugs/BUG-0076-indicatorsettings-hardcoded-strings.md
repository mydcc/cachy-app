---
id: BUG-0076
title: IndicatorSettings.svelte has extensive hardcoded English UI strings
type: bug
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: i18n
data_class: none
adr: none
depends_on: []
---

# BUG-0076 — IndicatorSettings.svelte has extensive hardcoded English UI strings

## Symptom

Same shape as [BUG-0007](BUG-0007-hardcoded-ui-strings.md): a German-language
UI shows untranslated English text. `src/components/settings/tabs/IndicatorSettings.svelte`
already imports and uses `$_` for its tab labels, but most of its "general"
tab content bypasses it.

## Evidence

**Demonstrated by inspection**, found while sweeping for remaining hardcoded
strings during BUG-0007 (2026-08-10). Not exhaustive — only the "general" tab
(`activeCategory === "general"`) was read; the file's other tabs
(oscillators/trend/volatility/volume) were not checked and likely have the
same pattern.

In the "general" tab alone (`IndicatorSettings.svelte:78-198`):

| Line | String |
| --- | --- |
| 80 | `Panel Configuration` |
| 81 | `Toggle visibility` |
| 85, 89, 93, 97, 101, 105, 109, 113 | `Summary`, `Oscillators`, `Moving Averages`, `Pivots`, `Confluence`, `Volatility`, `Advanced`, `Signals` (panel-section toggle labels) |
| 123 | `Calculation Engine` |
| 128 | `History Limit` |
| 141 | `Engine` |
| 147 | `Mode` |
| 153 | `Sync RSI Timeframe` |
| 161 | `Display Preferences` |
| 166 | `Precision` |
| 173 | `PnL Display Mode` |
| 175 | `Value`, `%`, `Bar` (inline mode labels) |
| 191 | `Favorite Timeframes` |

Several matching locale keys already exist and are unused, e.g.
`settings.technicals.optimization.title/preferredEngine/performanceMode` (see
`src/locales/locales/{de,en}.json` → `settings.technicals.optimization`),
`settings.technicals.historyLimit`, `settings.technicals.precision`,
`settings.technicals.pnlMode`, `settings.technicals.favorites`,
`settings.technicals.oscillators`/`movingAverages`/`pivots`/`trend` — these
look like they were added for this exact section and never wired up. Worth
checking against the schema before adding new keys.

## Cause

The component was scaffolded with literal strings and only the tab bar was
migrated to `$_` afterward; the rest was never revisited.

## Fix

Wire each hardcoded string in the "general" tab to `$_`, preferring the
existing unused keys listed above over adding new ones. Then check the other
four tabs (oscillators/trend/volatility/volume) for the same pattern and fix
those too, or file a follow-up if the scope turns out larger than expected.

## Acceptance criteria

- [ ] Every string listed in Evidence reads through `$_`, in both `de.json`
      and `en.json`
- [ ] The other four tabs are checked; findings fixed or listed here
- [ ] `npm run check` clean; `scripts/lint-i18n.js` passes
- [ ] Existing IndicatorSettings-related tests (if any) still pass

## Links

- [`BUG-0007`](BUG-0007-hardcoded-ui-strings.md) — same defect shape, where
  this was found
- `src/components/settings/tabs/IndicatorSettings.svelte`
- `src/locales/locales/de.json`, `src/locales/locales/en.json` — `settings.technicals.*`
