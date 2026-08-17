---
id: FEAT-0222
title: Evaluate and apply major dependency updates
type: feature
status: specced
priority: P2
milestone: M0
editions: [community, pro, private]
area: tooling
data_class: none
adr: none
depends_on: []
---

# FEAT-0222 — Evaluate and apply major dependency updates

## Problem
Jules skipped several major dependency updates during the weekly chore (#2016) to avoid breaking changes. These need to be manually evaluated, adapted if necessary, and merged to keep the codebase secure and up to date.

## Proposal
Manually update and test the major versions for `typescript`, `spacetimedb`, `openai`, `@types/jsdom`, and `undici`.

## Acceptance criteria

- [ ] `typescript` updated to `^7.0.2` (and `svelte-check` adjusted/aliases created for TS6 compatibility if required)
- [ ] `spacetimedb` updated to `^2.8.1` (check for API breaking changes)
- [ ] `openai` updated to `^7.4.0`
- [ ] `@types/jsdom` updated to `^30.0.0`
- [ ] `undici` updated to `^8.10.0`
- [ ] `npm run check` passes without errors
- [ ] `npm test` passes without errors

## Out of scope
Refactoring features unrelated to the updates.

## Open questions
- Wie hoch ist der Aufwand für den TypeScript 7 Alias Support in der CI?
- Verlangt SpacetimeDB 2.8.1 Änderungen in `src/lib/spacetimedb/`?
