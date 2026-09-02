---
id: FEAT-0370
title: Parallelize REST API requests in Bitunix positions synchronization
type: feature
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: journal
data_class: A
adr: none
depends_on: []
size: S
---

# FEAT-0370 — Parallelize REST API requests in Bitunix positions synchronization

## Problem

In `src/services/syncService.ts:193-248`, syncing positions and orders from Bitunix executes three independent REST requests sequentially:

```typescript
// 1. History
const historyRes = await fetch("/api/sync/positions-history", ...);
...
// 2. Pending
const pendingRes = await fetch("/api/sync/positions-pending", ...);
...
// 3. Orders
const ordersRes = await fetch("/api/sync/orders", ...);
```

Each network turnaround takes approximately 200–500ms depending on network latency. Because each request awaits completion before initiating the next, total synchronization time is the cumulative sum (600–1500ms) rather than the max turnaround time of a single parallel batch.

## Proposal

1. Execute all three endpoints concurrently using `Promise.allSettled`:
   ```typescript
   const [historyResult, pendingResult, ordersResult] = await Promise.allSettled([
       fetchHistoryPositions(...),
       fetchPendingPositions(...),
       fetchOrders(...)
   ]);
   ```
2. Process results and aggregate trade records once all promises settle.
3. Handle individual endpoint failures gracefully without aborting the entire sync if only orders or pending positions encounter transient errors.

## Evaluation

- **Umfang (Scope):** S (approx. 40 lines modified in `syncService.ts`)
- **Priorität (Priority):** P2 (Reduces journal sync duration by ~50–65%)
- **Schwierigkeit (Difficulty):** Low
- **Dringlichkeit (Urgency):** Medium

## Acceptance criteria

- [ ] History, pending positions, and orders requests are dispatched concurrently in parallel.
- [ ] Overall synchronization duration is reduced by at least 40% on identical network conditions.
- [ ] If one non-critical endpoint fails (e.g. pending positions), valid history trades are still imported.
- [ ] No regression in trade deduplication, schema validation, or Local-First Class A storage boundaries.

## Out of scope

- Changing Bitget sync mechanics.
- Altering the backend proxy routes.

## Open questions

None.

## Links

- `src/services/syncService.ts:193-248`
- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md)
