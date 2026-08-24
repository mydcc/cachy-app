---
id: BUG-0003
title: OMS force-prune can evict an order it was written to protect
type: bug
status: done
priority: P1
milestone: M0
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
start_date: 2026-08-01
target_date: 2026-08-13
size: S
estimate: 2
---


# BUG-0003 — OMS force-prune can evict an order it was written to protect

## Symptom

Under sustained order volume, the order map's force-prune step can delete an
order inserted moments ago, so a just-placed order disappears from tracking and
from the UI.

## Evidence

**Derived.** Full analysis: [`../../TODO.md`](../../TODO.md) item 14.

`omsService.ts` declares `const PRESERVE_LATEST = 20;` with the comment
*"Protect recent orders from being pruned immediately (UI needs to see them)"*.
Neither prune step reads it. Force Prune deletes
`this.orders.keys().next().value` — the literal oldest — unconditionally
whenever the map exceeds `MAX_ORDERS`.

Whether a user ever sees it depends on `MAX_ORDERS` against real order volume,
which has not been evaluated.

## Cause

The protection was named and never implemented.

## Fix

**Resolved** (commit `4ad0348`, merged via PR #1605). The chosen rule: always
keep the most recently inserted `PRESERVE_LATEST` (20) orders. Force Prune now
converts the map to an array, slices off everything beyond the most-recent 20
entries, and only evicts the oldest entry within that older slice. If every
remaining order is inside the protection window, Force Prune skips eviction
for that call rather than deleting a just-inserted order — `updateOrder()`
only triggers a single force-prune call per new order once the map is at
`MAX_ORDERS` (2000), so the skip path (which only applies when total size is
already at or below `PRESERVE_LATEST`) cannot leave the map growing unbounded
in practice. Safe Prune (removing finalized orders first) is unchanged.

## Acceptance criteria

- [x] The intended rule is written down in this item
- [x] A test fills the map past `MAX_ORDERS` and asserts a just-inserted order
      survives (`omsService.test.ts`, "should protect recently inserted
      orders from eviction (PRESERVE_LATEST)")
- [x] A test asserts the map is still bounded — "should keep map bounded even
      under sustained overflow"
- [x] `PRESERVE_LATEST` is read by the code that claims to honour it
      (`pruneOrders()`)

## Links

- [`docs/TODO.md`](../../TODO.md) item 14
- `src/services/omsService.ts` — `pruneOrders()`

## What shipped

Shipped in 1.2.0-beta.16.
