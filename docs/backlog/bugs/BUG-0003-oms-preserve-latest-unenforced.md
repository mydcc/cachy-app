---
id: BUG-0003
title: OMS force-prune can evict an order it was written to protect
type: bug
status: specced
priority: P1
milestone: M0
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
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

**A person has to pick the rule first** — the comments do not determine it:

- skip force-prune entirely while `orders.size <= PRESERVE_LATEST`, or
- always keep the most recently inserted `PRESERVE_LATEST` orders, falling back
  to some other candidate when everything remaining is recent.

This is live order-tracking state for real money. A wrong guess at the eviction
rule is worse than the current gap — so this stays `specced`, not `ready`, until
the rule is chosen.

## Acceptance criteria

- [ ] The intended rule is written down in this item
- [ ] A test fills the map past `MAX_ORDERS` and asserts a just-inserted order
      survives; it fails before the fix
- [ ] A test asserts the map is still bounded — the fix must not turn a prune
      into an unbounded map
- [ ] `PRESERVE_LATEST` is read by the code that claims to honour it

## Links

- [`docs/TODO.md`](../../TODO.md) item 14
- `src/services/omsService.ts` — `pruneOrders()`
