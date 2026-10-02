---
id: BUG-0601
title: Hardcoded duration bucket labels in stats calculator
type: bug
status: specced
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
- [ ] No regressions in statistics calculation or display
- [ ] The `i18n-lint` configuration no longer allows the hardcoded bucket labels

## Links
