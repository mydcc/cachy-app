---
id: FEAT-0223
title: SpacetimeDB SDK major version update
type: feature
status: done
priority: P2
milestone: M0
editions: [community, pro, private]
area: tooling
data_class: none
adr: none
depends_on: [FEAT-0222]
start_date: 2026-08-17
target_date: 2026-08-18
size: S
estimate: 2
---


# FEAT-0223 — SpacetimeDB SDK major version update

## Problem
The `spacetimedb` SDK update from 1.11.4 to 2.8.1 was skipped during weekly chores due to the high risk of breaking changes in the client API.

## Proposal
Update the SpacetimeDB client SDK. Carefully review the official SpacetimeDB changelog for breaking changes and adapt the frontend connection code in `src/lib/spacetimedb/`.

## Acceptance criteria
- [x] `spacetimedb` updated to `^2.8.1`
- [x] `src/lib/spacetimedb/` code adapted to new SDK methods if required
- [x] Global Chat feature (Class B data) successfully connects to the local/remote SpacetimeDB node
- [x] `npm run check` passes without errors
- [x] `npm test` passes without errors

## Out of scope
- Refactoring the chat UI

## Open questions
- Which exact breaking changes occurred between SpacetimeDB SDK v1 and v2.8?
  - `withModuleName` was renamed to `withDatabaseName` on `DbConnectionBuilder`.
  - The `onConnect` signature was updated to provide the `DbConnection` directly, alongside the `Identity` and `token`.
