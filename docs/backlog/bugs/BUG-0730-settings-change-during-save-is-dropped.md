---
id: BUG-0730
title: A settings change made while a save is in flight is dropped
type: bug
status: done
priority: P2
milestone: none
created: "2026-10-22"
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
assignee: opencode
branch: fix/bug-0730-settings-save-race
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

- [x] A change made while a save is running results in a save that includes it
      (queue one pending write instead of discarding, and drain it after the
      lock releases).
- [x] A test drives a slow save (a deferred encryption promise), changes a
      setting mid-flight, and asserts the persisted blob contains the new value.
- [x] No unbounded write loop: two changes during one save produce at most one
      follow-up write; the existing "only save if different" guard stays. (An
      encrypted save re-randomizes the device-key canary, so it rewrites even an
      unchanged blob; a deterministic profile is what makes the skip
      observable.)
- [x] The fix is covered for both an encrypted and an unencrypted profile.

## Out of scope

Changing the debounce interval, or moving encryption off the save path.

## Notes

Found while writing `tests/e2e/density.spec.ts`; the spec now waits for the
initial save before interacting, so the race is out of its way rather than
hidden.

## Progress — 2026-10-24

`save()` now queues exactly one follow-up write when `saveLock` is held and
drains it in the `finally` block. The follow-up reads the whole store, so every
change made during the in-flight save is included without a second write. The
drain is not a loop: a change during the follow-up queues exactly one more.

Covered by `src/stores/settings.saveQueue.test.ts`:

- unencrypted profile held on `getDeviceKey`; encrypted profile held on
  `applyFieldEncryption`;
- two save calls during one save coalesce into one follow-up write;
- a change made during the follow-up gets exactly one more write;
- a save that throws still releases the lock and drains the queue;
- a change and its revert run the follow-up but skip the write on the
  deterministic profile. (The production canary re-randomizes, so an encrypted
  save still writes; the guard itself is unchanged.)

The test is a `unit` test by design: the race lives in `save()`, so it calls
`save()` directly instead of depending on `$effect` timing. That keeps a
failure attributable to the queue rather than to the scheduler.
