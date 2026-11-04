---
id: BUG-0786
title: Window layout and locale writes hit localStorage raw, so a full quota throws into the global handler
type: bug
status: in-progress
priority: P2
milestone: none
editions: [community, pro, private]
area: persistence
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/news-race-and-storage
---

# BUG-0786 — Raw localStorage writes without quota handling (PA-04)

## Symptom

When storage is full, every drag/resize/zoom (`WindowBase.saveState`) and
every locale change throws a `QuotaExceededError` into the global handler,
which shows a blocking error modal, and the layout silently stops persisting.

## Evidence

Derived — `src/lib/windows/WindowBase.svelte.ts` (`saveState`) and
`src/locales/i18n.ts` (locale subscription). Production audit PA-04.

## Fix

Both writes go through `StorageHelper.safeSave`, which catches
`QuotaExceededError`, tries a cache cleanup, and retries. `WindowBase` exposes
`persistFailed` so a failed layout write can be surfaced.

## Verification

New tests in `src/lib/windows/WindowBase.test.ts` — a throwing
`localStorage.setItem` no longer escapes `saveState()` and sets
`persistFailed`; a successful save clears it. RED against `origin/develop`
(`QuotaExceededError … was thrown`), GREEN after the fix.
