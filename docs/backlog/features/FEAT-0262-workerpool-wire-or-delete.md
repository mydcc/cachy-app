---
id: FEAT-0262
title: Decide the fate of the unused workerPool service
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: services
data_class: none
adr: none
depends_on: []
---

# FEAT-0262 — Decide the fate of the unused workerPool service

## Problem

`src/services/workerPool.ts` (+ `workerPool.test.ts`) has zero production
importers repo-wide. Real worker infrastructure went elsewhere:
`TechnicalsWorkerManager` (singleton in `technicalsService`) and
`CalculationExecutor` (uses `BufferPool`). The dead abstraction misleads
contributors and carries maintenance surface for no runtime benefit.

Evidence basis: text search over import statements (Architect review,
2026-08-23). A string-built dynamic `import()` cannot be fully ruled out by
search alone — verify before acting.

## Proposal & Decision

Decision: **Delete** (Option 2) — human sign-off confirmed on 2026-08-26.
`src/services/workerPool.ts` and `src/services/workerPool.test.ts` removed
after verifying zero callers repo-wide.

## Acceptance criteria

Either outcome satisfies this item:

- [x] Decision (wire vs delete) is recorded in this item's body.
- [x] If deleted: no remaining references anywhere (incl. string-built
      `import()`); test file removed with it; `npm run check` green.
- [ ] If wired: a real consumer uses the pool under load with tests; no
      regression in existing `technicalsService` worker paths. (N/A)

## Out of scope

- General refactoring of the `technicalsService` worker infrastructure.

## Open questions

None (resolved).

## Links

- `src/services/workerPool.ts`, `src/services/workerPool.test.ts` (deleted)
- Source: Autonomous Optimization Architect review, 2026-08-23.
- Shipped in [PR #2349](https://github.com/mydcc/cachy-app/pull/2349).
