---
id: FEAT-0642
title: Remove the orphaned intl-messageformat dependency instead of upgrading it
type: feature
status: in-progress
priority: P3
assignee: opencode
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
---

Branch: `chore/remove-intl-messageformat`

## Problem

`intl-messageformat` sat at `^11.2.15` with 12.1.3 available, looking like a
routine major bump. It is not a dependency at all: nothing imports it, so
there is nothing to upgrade.

- No static import anywhere in `src`, `scripts`, `tests` or `server`.
- No dynamic `import("intl-messageformat")` anywhere either.
- `svelte-i18n` — the only conceivable consumer — declares
  `intl-messageformat: ^10.5.3` and carries its own nested 10.7.18. The
  top-level v11 serves no importer (`npm ls` shows no dependents).

The entry was load-bearing in exactly one place: `vite.config.ts` listed the
bare specifier in `optimizeDeps.include` and `ssr.noExternal`, both stale.

## What was verified

- `npm rm intl-messageformat`; both `vite.config.ts` entries removed (the
  whole `optimizeDeps` block existed only for this entry).
- The `i18n-vendor` chunking regex keeps its `intl-messageformat` alternative:
  it still matches the nested v10 copy under `svelte-i18n/node_modules`, and
  removing it would change chunking behavior — which is not part of removing
  an orphan.
- `npm run build` green. The only `intl-messageformat` strings left in the
  server bundle are sourcemap paths of the nested v10, which stays.
- `scripts/check_translations.sh`: SUCCESS, no critical issues.
- i18n-rendering component tests green (MarkdownView 2/2, AlertPanelView +
  ManageTab 30/30).

## Acceptance criteria

- [x] `intl-messageformat` gone from `package.json` and the lockfile
- [x] no stale `vite.config.ts` entries (except the chunking regex, kept
      deliberately — see above)
- [x] `npm run build` green
- [x] translations check green, i18n-rendering tests green
- [ ] `npm test` green — CI

## Out of scope

`negotiator` 0.6 → 1.1 (language routing, needs URL tests) and
`lightweight-charts-indicators` 0.5 → 0.9 (needs visual acceptance).
`conventional-changelog-conventionalcommits` stays blocked (BUG-0639),
TypeScript 7 stays blocked until 7.1.
