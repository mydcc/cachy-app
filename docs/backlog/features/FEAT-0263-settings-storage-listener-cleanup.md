---
id: FEAT-0263
title: Remove the settings cross-tab storage listener in destroy
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: settings
data_class: none
adr: none
depends_on: []
---

# FEAT-0263 — Remove the settings cross-tab storage listener in destroy

## Problem

`src/stores/settings.svelte.ts` registers
`window.addEventListener("storage", …)` in its constructor (~L958) but
`destroy()` (~L1666–1676) never removes it — it clears an effect and a timer,
then stops. Sibling stores implement full disposal contracts (`journalState` /
`marketState` use `import.meta.hot.dispose`). Because the store is a module
singleton, this leaks only across dev HMR cycles (duplicated handlers), but it
is an inconsistent disposal contract.

Evidence basis: read directly in code (Architect review, 2026-08-23).

## Proposal

Store the handler reference and call `removeEventListener("storage", …)` in
`destroy()`. Optionally add `import.meta.hot.dispose(() => settingsState.destroy())`
for parity with sibling stores.

## Acceptance criteria

- [x] `destroy()` removes the storage listener (test proves a dispatched
      `storage` event after `destroy()` does not reach the handler).
- [x] Cross-tab settings sync still works while the store is alive.
- [x] `npm run check` + existing settings-store tests pass.

## Out of scope

- Any persistence/encryption changes to the settings store.
- The broader settings-store split (FEAT-0197, already done).

## Open questions

None.

## Links

- `src/stores/settings.svelte.ts`
- Source: Autonomous Optimization Architect review, 2026-08-23.
