---
id: BUG-0412
title: Two mounted sidebars fetch the account concurrently and race
type: bug
status: specced
priority: P0
milestone: M4
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: []
---

# BUG-0412 — Two mounted sidebars fetch the account concurrently and race

## Symptom

After a reload, FIVE identical `POST /api/account` (1.1 kB each) fire
within 1.25 s (572/621/989/1070/1250 ms, observed live Sep 2026,
filter `account`). The codebase has exactly one caller
(`PositionsSidebar.fetchAccount`), so one code path fires concurrently
and redundantly. Overlapping reads have no ordering — last response
wins — so a slow pre-write fetch landing after a fast post-write fetch
overwrites fresh values with stale ones. This is the race behind
BUG-0409's frozen chip and never-real combos.

## Reproduction

1. Live account, reload with Network filter `api/account`.
2. Count the `account` POSTs in the first ~2 s: several, not one.
3. Change position mode in Cachy, confirm twice, watch the account rows:
   write (`account-settings`, 200) plus overlapping `account` reads.
4. Which overlapping response lands last decides the chip — repeat until
   a stale one wins (a few tries suffice).

## Cause

`PositionsSidebar` mounts twice — desktop (`+page.svelte:297`,
CSS-hidden below xl) and mobile (`+page.svelte:702`, CSS-hidden at xl
and up). CSS-hidden is still mounted: both instances run their mount
fetch, their keys-change effect and their channels-ready effect, each
POSTing independently, while both share one `syncCallback` slot
(`registerSyncCallback` overwrites). Both instances are identical
(`<PositionsSidebar />`, no props) — the duplication buys different
placement, but each instance also owns fetching, and that half is pure
overhead with a correctness cost. No request sequencing exists anywhere;
the session guard covers account switches only, not overlapping reads
of the same account.

## Expected

- Exactly one account fetch per trigger regardless of mounted instance
  count: single-flight the fetch (one owner — hoisted fetch or a
  request sequence where stale responses cannot overwrite fresher
  ones).
- A CSS-hidden instance must not fetch.
- With one instance or two, repeated reloads show one `account` POST
  per trigger in Network; mode changes reflect after confirm without
  reload roulette.
- Out of scope: venue push channel (none exists — BUG-0409), atomic
  chip snapshot (BUG-0409), sidebar-independent reads (BUG-0410).

## Notes

Is two sidebars intentional? The placement split (desktop column vs
mobile flow) is a legitimate responsive pattern — but data fetching
must not be duplicated with it. Rendering twice is fine; fetching twice
with last-wins and no ordering is the bug. No behavior or prop differs
between the instances today.

## Links

- [`BUG-0409`](./BUG-0409-mode-chip-stale-after-change.md) — the user-visible staleness this race produces
- [`BUG-0410`](./BUG-0410-mode-state-must-not-depend-on-sidebar.md) — same file, opposite direction (no sidebar, no read)
- [`BUG-0060`](./BUG-0060-positions-account-envelope-mismatch.md) — envelope shape, done
