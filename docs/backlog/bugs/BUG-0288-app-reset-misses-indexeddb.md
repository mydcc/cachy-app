---
id: BUG-0288
title: App reset clears localStorage but leaves the IndexedDB device key and caches behind
type: bug
status: in-progress
priority: P3
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
assignee: opencode
branch: fix/bug-0288-reset-indexeddb
---

# BUG-0288 — App reset clears localStorage but leaves the IndexedDB device key and caches behind

## Symptom

`SettingsContent.svelte`'s reset (`handleReset`, line ~146) runs
`localStorage.clear()` only. The crypto device key (`cachy_db`/kv_store) and
news/sentiment caches in IndexedDB survive "delete everything".

## Evidence

**Derived** — from reading the reset handler. Completeness gap in the erasure
path rather than an active leak: nothing is sent anywhere, but key material and
cached data outlive their deletion.

## Cause

Reset was written against the localStorage-only era; IndexedDB stores arrived
later without being added to the teardown.

## Fix

Enumerate and delete IndexedDB databases (and Caches API entries if present)
during reset. Reuse/extend the existing device-key removal logic rather than
duplicating it.

### Known limitation (documented, follow-up candidate)

A reset can only close the IndexedDB connections of *its own* tab. Connections
held by other open tabs block `deleteDatabase()`; per design the wipe resolves
best effort instead of hanging, so in a multi-tab scenario those databases can
survive until every tab is closed. Surfaced during review of the fix: a small
`BroadcastChannel` "close your IDB connections" ping to other tabs before
deleting would close the gap — spun off as its own item,
[`BUG-0294`](BUG-0294-multi-tab-reset-misses-indexeddb.md), rather than
widening this one.

## Acceptance criteria

- [ ] After reset, `indexedDB.databases()` reports none of the app's stores —
      asserted in a test with fake-indexeddb
- [ ] Reset still works when IndexedDB is unavailable (graceful degradation,
      localStorage part completes)
- [ ] DE + EN confirmation copy mentions what is deleted

## Out of scope

Server-side erasure (nothing server-side exists for Class A). Backup export.

## Links

- `src/components/settings/SettingsContent.svelte`
- [`BUG-0053`](BUG-0053-device-key-loss-orphans-secrets.md) — device-key handling context
- Security audit 2026-08-23, finding "app reset misses IndexedDB" (Low)
