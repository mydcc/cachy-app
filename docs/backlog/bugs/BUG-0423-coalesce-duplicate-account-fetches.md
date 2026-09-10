---
id: BUG-0423
title: Coalesce duplicate account fetches from two mounted sidebars
type: bug
status: done
priority: P3
milestone: M4
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: [BUG-0412]
---

# BUG-0423 — Coalesce duplicate account fetches from two mounted sidebars

Split out of BUG-0412 (2026-09-08 grooming): the ordering half is proven and
closed there; this is the remaining deduplication half. Traffic, not
correctness — a stale response can no longer corrupt the store.

## Symptom

After a reload, several identical `POST /api/account` fire within ~2 s (five
observed live Sep 2026). `PositionsSidebar` mounts twice — desktop and mobile,
CSS-hidden but alive — and each instance runs its mount fetch, keys-change
effect and channels-ready effect independently.

## Evidence

Demonstrated: reporter capture (five identical 1.1 kB `POST /api/account`
within 1.25 s, single caller `PositionsSidebar.fetchAccount`). The duplicate
requests still go out after BUG-0412; they just cannot corrupt the store any
more.

## Cause

Two mounted instances, one shared `syncCallback` slot, no request coalescing.
Rendering twice is a legitimate responsive pattern; fetching twice is pure
overhead.

## Fix

- Exactly one account fetch per trigger regardless of mounted instance count:
  single-flight the fetch (one owner — hoisted fetch or shared inflight
  promise).
- A CSS-hidden instance must not fetch.
- Deliberately not bundled into BUG-0412: coalescing makes the ordering
  reproduction unreachable (two mounts would produce one request), so it needs
  its own test shape and its own review, not a rewrite of the ordering test.

## Acceptance criteria

- [ ] With two sidebar instances mounted, a reload shows one `account` POST
      per trigger in Network, not one per instance
- [ ] A CSS-hidden instance issues no fetch of its own
- [ ] A test stages two mounts and asserts a single request; it fails without
      the fix and passes with it
- [ ] The BUG-0412 ordering tests still pass unchanged

## Out of scope

- Venue push channel (none exists — BUG-0409).
- Atomic chip snapshot (BUG-0409).
- Sidebar-independent reads (BUG-0410, done).

## Links

- [`BUG-0412`](./BUG-0412-duplicate-sidebar-account-fetch-race.md) — the ordering half, done; related race-spot audit reused here
