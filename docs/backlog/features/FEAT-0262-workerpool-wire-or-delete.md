---
id: FEAT-0262
title: Decide the fate of the unused workerPool service
type: feature
status: specced
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

## Proposal

Make a deliberate call, recorded in this item:

1. **Wire it up** — candidate workload: parallel bulk indicator backfill across
   symbols; or
2. **Delete** file + test after verifying no references (including string-built
   dynamic imports).

Deletion requires explicit human sign-off per project rules ("Do not delete
code of unclear purpose").

## Acceptance criteria

Either outcome satisfies this item:

- [ ] Decision (wire vs delete) is recorded in this item's body.
- [ ] If deleted: no remaining references anywhere (incl. string-built
      `import()`); test file removed with it; `npm run check` green.
- [ ] If wired: a real consumer uses the pool under load with tests; no
      regression in existing `technicalsService` worker paths.

## Out of scope

- General refactoring of the `technicalsService` worker infrastructure.

## Open questions

- **Blocking:** wire-or-delete is a human decision — the item stays `specced`
  until decided.

## Links

- `src/services/workerPool.ts`, `src/services/workerPool.test.ts`
- Source: Autonomous Optimization Architect review, 2026-08-23.
