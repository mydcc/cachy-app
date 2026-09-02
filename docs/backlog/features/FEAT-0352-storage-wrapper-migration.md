---
id: FEAT-0352
title: "Migrate all raw localStorage access to storageWrapper"
type: feature
status: specced
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
- [ ] Audit all instances of `localStorage` in `src/stores/` and `src/services/`.
- [ ] Replace `localStorage.setItem(key, value)` with `storageWrapper.setItem(key, value)`.
- [ ] Replace `localStorage.getItem(key)` with `storageWrapper.getItem(key)`.
- [ ] Remove any now-redundant local `try/catch` blocks handling quota limits inside the stores (let the wrapper handle it).
- [ ] `npm run check` and `npm test` must pass cleanly.

## Out of scope
- Refactoring IndexedDB usage.
- Refactoring `storageWrapper.ts` itself.
