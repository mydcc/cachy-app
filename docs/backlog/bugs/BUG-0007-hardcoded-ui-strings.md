---
id: BUG-0007
title: Several UI strings are hardcoded instead of translated
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: i18n
data_class: none
adr: none
depends_on: []
start_date: 2026-08-01
target_date: 2026-08-13
size: XS
estimate: 1
---


# BUG-0007 — Several UI strings are hardcoded instead of translated

## Symptom

German UI shows English text and English UI shows German text, depending on the
control.

## Evidence

**Demonstrated by inspection**, re-verified 2026-08-01 while archiving the
report that first raised it:

| File | String |
| --- | --- |
| `src/lib/windows/implementations/AssistantView.svelte:261` | `Anwenden` |
| `src/lib/windows/implementations/AssistantView.svelte:268` | `Ignorieren` |
| `src/lib/windows/implementations/SymbolPickerView.svelte:293` | `Majors Only` |
| `src/components/settings/tabs/IndicatorSettings.svelte:134` | `Auto Optimize` |

The list is not exhaustive — it is what the original report named, confirmed
still present. A sweep should find the rest.

## Fix

Move each to `src/locales/locales/*.json` and read it through `$_`. Per
`CLAUDE.md`, add every new key in **both** languages.

## Acceptance criteria

- [x] The four strings above are translated in German and English
- [x] A sweep for remaining literal UI strings is done and its findings are
      either fixed or listed in this item
- [x] `npm run check` clean; `scripts/lint-i18n.js` passes

## Resolution

**RESOLVED** (2026-08-10). All four strings now read through `$_`, each
using an existing, previously-unused locale key rather than a new one — the
keys had already been added to both `de.json`/`en.json` (and
`schema.d.ts`) but nothing referenced them yet:

| File | Was | Now |
| --- | --- | --- |
| `AssistantView.svelte:273` | `Anwenden` | `$_("common.apply")` |
| `AssistantView.svelte:280` | `Ignorieren` | `$_("common.ignore")` |
| `SymbolPickerView.svelte:293` | `Majors Only` | `$_("symbolPicker.hideAlts")` (matches the bound `hideAlts` checkbox) |
| `IndicatorSettings.svelte:134` | `Auto Optimize` | `$_("settings.technicals.optimization.autoOptimize")` |

`scripts/lint-i18n.js` passes both before and after this change — its
regex-based heuristics (min length 10, no internal capitals) miss all four
of these strings, so it is not a reliable sweep tool on its own. A manual
grep for other German UI text (`Abbrechen`, `Speichern`, `Schließen`,
`Löschen`, `Bearbeiten`, `Warnung`, …) leaking into English-labeled markup
across `src/lib` and `src/components` found none beyond the two fixed above.

**Sweep finding, not fixed here — out of scope for this item's size:**
`IndicatorSettings.svelte`'s "general" tab has substantially more hardcoded
English strings than the one named in this bug — section headings
("Calculation Engine", "Display Preferences", "Panel Configuration",
"Favorite Timeframes"), field/toggle labels ("History Limit", "Engine",
"Mode", "Precision", "Sync RSI Timeframe", the panel-section toggles
Summary/Oscillators/Moving Averages/Pivots/Confluence/Volatility/Advanced/
Signals), and likely similar patterns in the file's other tabs
(oscillators/trend/volatility/volume, not read in this pass). This is a
same-shape but much larger version of this bug, worth its own backlog item
rather than folding an unbounded scope into a P3 fix. Filed as
[`BUG-0076`](BUG-0076-indicatorsettings-hardcoded-strings.md).

## Links

- `docs/archive/reports/analysis_report.md` — where this was first raised
- [`BUG-0076`](BUG-0076-indicatorsettings-hardcoded-strings.md) — follow-up
  for `IndicatorSettings.svelte`'s remaining hardcoded strings, found during
  this item's sweep

## What shipped

Shipped in 1.3.0-beta.8.
