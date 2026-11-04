---
id: BUG-0783
title: Service worker precache is atomic and the app shell is not cached, so offline cold start fails
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: pwa
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/sw-precache-appshell
---

# BUG-0783 — Service worker precache robustness and app-shell offline (PA-07/PA-08)

## Symptom

`cache.addAll(ASSETS)` aborted the whole install/update on one failing asset,
and navigations were never cached, so a reload without network showed the
browser offline page although Journal/Settings/Presets are local.

## Evidence

Derived — `src/service-worker/index.ts`. Production audit PA-07/PA-08; no
service-worker test exists.

## Fix

- Install caches assets with `Promise.allSettled`; partial successes stay.
- The app shell (`/`) is cached and served as a navigation fallback
  (network-first, shell on failure/non-ok).
- All cache operations log failures instead of failing silently.

## Verification

`svelte-check` 0 errors; merged in #4499.
