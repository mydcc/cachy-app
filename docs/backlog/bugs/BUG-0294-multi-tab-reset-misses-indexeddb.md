---
id: BUG-0294
title: Factory reset cannot delete IndexedDB blocked by connections held in other tabs
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: [BUG-0288]
---

# BUG-0294 — Factory reset cannot delete IndexedDB blocked by connections held in other tabs

## Symptom

A user performs a factory reset (Settings → Danger Zone) with a second Cachy
tab open. The resetting tab clears localStorage and asks IndexedDB to delete
its databases, but the deletion never completes: the device key
(`CachySecurityDB`) and the news/sentiment/kline caches survive, and after the
automatic reload the app re-hydrates exactly what "delete everything" was
supposed to remove.

## Evidence

**Derived** — from reading the code introduced by BUG-0288 plus the IndexedDB
spec; not yet reproduced live:

- `src/utils/appReset.ts` resolves each `indexedDB.deleteDatabase()` on
  `onblocked` by design so a reset can never hang. Per spec, deletion stays
  pending while any connection to that database is open — including
  connections held by *other* tabs, which are separate JS realms that
  `wipeLocalData()` cannot reach (`dbService.close()` /
  `storageService.close()` only close this tab's connections).
- Consequence: in a multi-tab scenario every `cachy_db`/`CachySecurityDB`/
  `CachyDB` deletion silently degrades to a no-op while the resetting tab
  proceeds to reload.

Being derived, the fix needs a reproducing test first: fake-indexeddb models
the blocking behaviour when a second open connection exists.

## Cause

Browser storage is shared across tabs of an origin, but JS state is per-tab.
The reset path can coordinate localStorage implicitly (it is synchronous and
shared), yet nothing tells sibling tabs to release their long-lived IndexedDB
connections before the deletion request runs.

## Fix

Coordinate via BroadcastChannel before deleting:

1. On startup, listen on a dedicated channel (e.g. `cachy-reset`) and, on a
   ping, close this tab's IndexedDB connections (`dbService.close()`,
   `storageService.close()`).
2. In `wipeLocalData()`, post the ping, wait a short bounded grace period
   (long enough for sibling handlers to run, short enough to never hang), then
   proceed with enumeration + `deleteDatabase()` as today.
3. If `BroadcastChannel` is unavailable, skip straight to the current
   best-effort behaviour — no functional regression.

Keep the existing best-effort semantics: even after coordination, a blocked
deletion must resolve rather than hang the reset.

## Acceptance criteria

- [ ] A test reproduces the defect: with a second open connection to
      `cachy_db` simulating another tab (fake-indexeddb), the current wipe
      leaves the database in place — failing without the fix
- [ ] With the fix, the same scenario deletes the database: the simulated
      sibling closes its connections on the ping within the grace window
- [ ] Reset still completes when `BroadcastChannel` is unsupported or no
      sibling answers — asserted by a test
- [ ] Existing `appReset.test.ts` scenarios stay green (single-tab behaviour,
      graceful degradation without IndexedDB)
- [ ] The grace window is bounded and cannot delay the reset indefinitely

## Out of scope

Closing connections inside the service worker (it holds none for these
databases). Cross-origin or partitioned storage. Any change to eviction or
persistence policies. Server-side erasure (still none exists for Class A).

## Links

- [`BUG-0288`](BUG-0288-app-reset-misses-indexeddb.md) — introduced
  `wipeLocalData()`; this item closes the gap its "known limitation" documents
- `src/utils/appReset.ts` — the reset teardown
- `src/services/dbService.ts`, `src/services/storageService.ts` — the
  closeable connection holders
- PR #2232 — review thread where the multi-tab case surfaced
