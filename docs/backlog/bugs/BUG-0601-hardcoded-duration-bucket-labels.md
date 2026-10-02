---
id: BUG-0601
title: Hardcoded duration bucket labels in stats calculator
type: bug
status: done
assignee: opencode
branch: fix/i18n-hardcoded-labels
priority: P3
milestone: none
editions: [community, pro, private]
area: i18n
data_class: none
adr: none
depends_on: []
---

# BUG-0601 — Hardcoded duration bucket labels in stats calculator

## Symptom

The trade duration buckets in the statistics calculator use hardcoded English strings (e.g., `< 15m`, `15m - 1h`, `> 24h`), bypassing the translation layer and forcing English labels regardless of the user's locale.

## Evidence

**Derived, from reading the code**

In `src/lib/calculators/stats.ts`, the `getDurationStats` function uses literal text strings for the `label` field of its returned buckets:
```typescript
// src/lib/calculators/stats.ts
  const buckets = [
    {
      label: "< 15m",
// ...
```
These strings were exempted in `scripts/i18n-lint.config.json` via the allowlist, but they mask translatable UI strings.

## Cause

The strings are instantiated inside a pure TypeScript calculator module rather than a Svelte component, making direct store access `$_` inconvenient, so they were hardcoded and added to the linter allowlist.

## Fix

Add corresponding translation keys for these duration buckets in `en.json` and `de.json`. Since this is a pure TypeScript file, either pass a translation function to `getDurationStats` or return localization keys instead of literal labels and resolve them at the UI boundary. Remove the `< 15m`, `15m - 1h`, `1h - 4h`, `4h - 24h`, and `> 24h` exemptions from `scripts/i18n-lint.config.json` once completed.

## Acceptance criteria

- [ ] Duration bucket labels render in the correct language matching the selected locale
- [x] No regressions in statistics calculation or display
- [x] The `i18n-lint` configuration no longer allows the hardcoded bucket labels

## State

Shipped in `fix/i18n-hardcoded-labels`. `getDurationStats` now returns
`labelKeys` (typed `TranslationKey[]`) instead of display strings, and the five
keys live under `journal.deepDive.charts.labels.duration*` next to the existing
`duration` / `durationAnalysis` entries.

The first acceptance criterion stays unticked on purpose: **nothing renders
`durationStatsMetrics` yet.** `aggregator.ts` and `journal.svelte.ts` carry the
object, and no `.svelte` file reads it — `JournalCharts.svelte` and
`JournalDeepDive.svelte` have no duration section. So the calculator no longer
ships English text, but no user sees the buckets in either language yet. The
rendering half belongs to whichever PR adds that chart; it maps
`labelKeys[i]` through `$_()` alongside `pnlData[i]` / `winRateData[i]`.

## Links
