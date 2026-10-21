---
id: BUG-0708
title: Changing the English technical-terms setting has no effect until reload
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
size: XS
estimate: 1
---

# BUG-0708 — Changing the English technical-terms setting has no effect until reload

## Symptom

The setting "Fachbegriffe auf Englisch (Entry, TP, etc.)" sits in Settings →
System and looks like a live switch. Toggling it changes nothing on screen;
the hybrid German-with-English-terms locale only appears after a reload (or
after switching the UI language back and forth). A user reasonably concludes
the feature is dead code.

## Evidence

**Derived** — not reproduced in a running app in this session; it follows from
the call graph. The dictionary side is implemented and unit-tested, so the
feature is not dead code — the missing piece is reactivity.

- `src/locales/i18n.ts` registers a hybrid `de-tech` locale: `buildDeTechDict`
  overlays ~80 `TECHNICAL_KEYS` from `en.json` onto the German dictionary
  (`i18n.ts:173-197`), covered by `src/locales/i18n.loaders.test.ts`.
- `updateEffectiveLocale()` (`i18n.ts:223`) maps `de` → `de-tech` when
  `settingsState.forceEnglishTechnicalTerms` is true.
- `updateEffectiveLocale()` is only invoked from the `locale` store
  subscription (`i18n.ts:263`) and a startup `setTimeout` (`i18n.ts:271`).
  Nothing subscribes to the setting itself.
- The UI toggle (`src/components/settings/tabs/SystemTab.svelte:423`) only
  binds `settingsState.forceEnglishTechnicalTerms`; it never calls
  `setLocale`/`updateEffectiveLocale`.

Consequence: changing the setting does not change the active locale, so the
screen keeps the old dictionary until the next startup or language switch.

## Cause

The effective-locale mapping depends on two inputs — the UI locale and the
technical-terms flag — but is only re-evaluated when the locale input changes.
The settings input has no trigger.

## Fix

1. Re-evaluate the effective locale when `forceEnglishTechnicalTerms` changes
   (e.g., subscribe in the i18n module or call `updateEffectiveLocale()` /
   re-set the locale from the settings reaction). Keep the existing sequence
   token so rapid toggles stay race-safe.
2. Do not broaden `TECHNICAL_KEYS` here; the list is a separate concern.
3. Add a test that flips the setting and asserts the effective locale changes
   without a reload; it must fail before the fix.

## Acceptance criteria

- [ ] Toggling the setting switches the effective locale between `de` and
      `de-tech` immediately, with no reload.
- [ ] A test reproduces the current behaviour first (setting change alone
      leaves the locale at `de`) and passes after the fix.
- [ ] Existing `buildDeTechDict` tests stay green.
- [ ] `<html lang>` remains `de` in both `de` and `de-tech` (WCAG 3.1.1).

## Out of scope

- Extending or trimming the `TECHNICAL_KEYS` list.
- Translating terms or changing the i18n architecture.
- Any other settings-toggle reactivity.

## Links

- `src/locales/i18n.ts` — `de-tech` registration, `buildDeTechDict`,
  `updateEffectiveLocale`
- `src/locales/i18n.loaders.test.ts` — dictionary overlay tests
- `src/components/settings/tabs/SystemTab.svelte` — the toggle
- `src/stores/settings/settingsTypes.ts` — `forceEnglishTechnicalTerms`
