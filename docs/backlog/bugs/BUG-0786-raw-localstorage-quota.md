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

When storage is full, every gesture-end layout save (`WindowBase.saveState`)
and every locale change throws out of the caller into the global handler,
which shows a blocking error modal, and the layout silently stops persisting.

## Evidence

Derived — `src/lib/windows/WindowBase.svelte.ts` (`saveState`) and
`src/locales/i18n.ts` (locale subscription) wrote `localStorage.setItem`
directly. Demonstrated by the tests below, which throw a real `DOMException`
of each class at the write.

## Cause

Neither call site contained the exception. `StorageHelper.safeSave` already
existed and handles `QuotaExceededError` (evict cached entries, retry once),
but it rethrows everything else, and neither caller wrapped it.

## Fix

Both writes go through `StorageHelper.safeSave` inside a `try`/`catch`, so a
quota hit, a blocked-storage `SecurityError` (where the `localStorage` property
access itself throws) or any other storage error stays at the call site and is
logged. The window layout and the locale still apply for the session; they
just may not survive a reload.

`saveState` does not expose a failure flag: nothing in the UI reads window
geometry, and the reset is visible on reload. It logs at warn level instead of
carrying dead state.

## Acceptance criteria

- [x] A full quota at the window-layout write does not throw, and a later save
      still reaches storage
- [x] A blocked-storage `SecurityError` at the same write does not throw
- [x] A quota hit and a `SecurityError` at the locale write do not throw
- [x] A working write still persists the locale

## Out of scope

- `StorageHelper.cleanupCache()` also removes `cachy_settings_backup` to free
  space. No code writes that key today, so it is latent, but evicting a
  settings backup for a window position is wrong and belongs in its own change.
- `NewsSentimentPanel.svelte` swallows `localStorage` errors in two empty
  catches (same family, different file).

## Links

- `src/lib/windows/WindowBase.svelte.ts` (`saveState`)
- `src/locales/i18n.ts` (locale subscription)
- `src/utils/storageHelper.ts` (`safeSave`)
- ADR-0001 (Local-First boundary)
