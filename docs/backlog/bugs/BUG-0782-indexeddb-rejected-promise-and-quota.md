---
id: BUG-0782
title: A failed indexedDB.open leaves a permanently rejected promise, and quota write failures are only logged
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: persistence
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/indexeddb-reset-quota
---

# BUG-0782 — IndexedDB error reset and quota eviction (PA-05/PA-06)

## Symptom

A failed `indexedDB.open` left a permanently rejected `dbPromise`, so the
kline cache stayed dead for the whole session. Write errors (including quota)
were only logged; the cache silently stopped growing with no eviction and no
notice.

## Evidence

Derived — `src/services/storageService.ts` (`initDB`, `saveKlines`). The
production audit (PA-05/PA-06) recorded both.

## Fix

- `initDB` resets `dbPromise` to `null` on failure (only if it is still the
  same promise) so `getDB()` retries.
- `saveKlines` detects a quota error, evicts the oldest chunk for the
  symbol/timeframe, warns once, and retries once.
- `saveKlinesOnce` no longer swallows errors, so the recovery path is
  reachable; writes await transaction completion.
- `getKlines` and `clearAll` no longer leak rejections/partial commits.

## Verification

`src/services/storageService.test.ts` and `src/tests/security/storage_hardening.test.ts` green; `svelte-check` 0 errors; merged in #4498.
