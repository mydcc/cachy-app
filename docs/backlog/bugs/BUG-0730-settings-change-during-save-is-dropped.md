---
id: BUG-0730
title: A settings change made while a save is in flight is dropped
type: bug
status: specced
priority: P2
milestone: none
created: "2026-10-22"
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
---

# BUG-0730 — A settings change made while a save is in flight is dropped

## Symptom

`SettingsManager.save()` returns immediately when `saveLock` is set
(`src/stores/settings.svelte.ts:2111`). The autosave effect debounces by 500 ms,
but it does not re-queue a write when the save it fires into is still running:
the call is discarded, and nothing schedules another one. The change stays in
the store and is written only if some later edit happens to trigger the effect
again. If the user closes the app in between, it is gone.

The window is not theoretical: the first save after load awaits device-key
encryption of the exchange and provider credentials, so it can hold the lock
for about a second.

**Observed** while building the density E2E (FEAT-0614): selecting `compact`
during the initial save set `data-density="compact"` on the root, while the
persisted blob still carried `"density":"default"`. Reloading lost the choice.

## Why it matters

Every setting is Class A data. A silently dropped write is the one failure mode
the store's "declared tracking" work (ADR-0024) was meant to make impossible —
it guarantees the change *schedules* a save, not that the save *happens*.

## Acceptance criteria

- [ ] A change made while a save is running results in a save that includes it
      (queue one pending write instead of discarding, and drain it after the
      lock releases).
- [ ] A test drives a slow save (a deferred encryption promise), changes a
      setting mid-flight, and asserts the persisted blob contains the new value.
- [ ] No unbounded write loop: two changes during one save produce at most one
      follow-up write, and an unchanged store produces none (the existing
      "only save if different" guard stays).
- [ ] The fix is covered for both an encrypted and an unencrypted profile.

## Out of scope

Changing the debounce interval, or moving encryption off the save path.

## Notes

Found while writing `tests/e2e/density.spec.ts`; the spec now waits for the
initial save before interacting, so the race is out of its way rather than
hidden.
