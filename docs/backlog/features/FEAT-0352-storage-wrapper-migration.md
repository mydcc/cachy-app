---
id: FEAT-0352
title: "Migrate all raw localStorage access to storageWrapper"
type: feature
status: in-progress
assignee: opencode
branch: feat/0352-storage-wrapper-migration
priority: P1
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
parent: FEAT-0341
depends_on: []
---

## Description
Despite the existence of a robust `storageWrapper.ts` and `storageHelper.ts` to manage quota limits and provide unified error handling, a codebase sweep shows over 100 raw `localStorage.getItem` and `localStorage.setItem` calls scattered deeply throughout `src/stores/*.svelte.ts` and `src/services/`.
Direct access to localStorage bypasses error handling; if the browser quota is reached, or Private mode disables localStorage, `setItem` throws an unhandled exception that can crash the Svelte app or corrupt state.

## Acceptance criteria
- [x] Audit all instances of `localStorage` in `src/stores/` and `src/services/`.
- [x] Replace `localStorage.setItem(key, value)` with `storageWrapper.setItem(key, value)`.
- [x] Replace `localStorage.getItem(key)` with `storageWrapper.getItem(key)`.
- [x] Remove any now-redundant local `try/catch` blocks handling quota limits inside the stores (let the wrapper handle it).
- [ ] `npm run check` and `npm test` must pass cleanly.

## Out of scope
- Refactoring IndexedDB usage.
- Refactoring `storageWrapper.ts` itself.

## What shipped

- 51 raw call sites in 41 files under `src/stores/` and `src/services/`
  migrated to `safeLocalStorage` (PR #3603). `src/lib`, `src/components`,
  `src/routes` and `scripts/` still use raw access and stay out of scope.
- `writeRuleOriginLedger` and drawing-anchors `persist` return the wrapper
  boolean instead of a hardcoded `true`, so quota failures still report
  `false`. `readStoredRules` keeps its local try/catch: a throwing store
  must read as no rules without poisoning the content-keyed cache.
- Existing `browser`/`typeof` guards and JSON-parse try/catch blocks kept —
  they guard more than quota.
- Test-only: `browser: true` mock for `$app/environment` in
  `autoBackupService`, `ruleOriginLedger`, `onboarding`,
  `promoteAlert.integration`, `botStore.integration` and
  `botStore.deleteBot` tests (`drawings.test.ts` pattern);
  `ruleLoopWiring` failure-path spy moved
  from the `localStorage` global to `safeLocalStorage.getItem`. No
  assertions changed.
- Review round (PR #3603): `writeRuleStates`, `recordFiring` and
  `clearShadowLedger` return the wrapper boolean too (same hardcoded-true
  shape as the first two fixes). Flip back to `in-progress` until CI is
  green; re-flip to `done` once it is.
