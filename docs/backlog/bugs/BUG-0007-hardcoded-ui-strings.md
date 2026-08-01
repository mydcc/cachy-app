---
id: BUG-0007
title: Several UI strings are hardcoded instead of translated
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

- [ ] The four strings above are translated in German and English
- [ ] A sweep for remaining literal UI strings is done and its findings are
      either fixed or listed in this item
- [ ] `npm run check` clean; `scripts/lint-i18n.js` passes

## Links

- `docs/archive/reports/analysis_report.md` — where this was first raised
