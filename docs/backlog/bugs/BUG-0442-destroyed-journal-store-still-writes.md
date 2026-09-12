---
id: BUG-0442
title: A destroyed journal store can still write to localStorage
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: journal
data_class: A
adr: none
depends_on: []
---

# BUG-0442 — A destroyed journal store can still write to localStorage

## Symptom

`journalState.destroy()` stops what is *pending* but does not disarm the store. A
destroyed `JournalManager` still accepts `scheduleSave()`, still runs `save()`, and
still runs `saveSync()` — so a store the app has torn down can write the journal
(Class A data) to `localStorage` afterwards.

The visible consequence today is a CI flake: `journal_persistence.test.ts`'s
"batches a rapid burst of mutations into exactly one persistence write" intermittently
reports `expected 2 to be 1`. Observed on PR #3192, passing on rerun of the identical
commit, and 10/10 green locally in isolation. The test's own `beforeEach` comment
already names this flake and destroys the module-level singleton as the mitigation —
a mitigation that cannot work while `destroy()` leaves the singleton armed.

## Evidence

**Derived**, from two pieces of code that disagree about what `destroy()` means.

`src/stores/journal.svelte.ts:28,34` — the flag is set once, in the constructor, and
nowhere else:

```ts
private effectActive = false;
// constructor:
this.load();
this.effectActive = true;
```

`src/stores/journal.svelte.ts:53-66` — `destroy()` clears the effect cleanup, the
pending `saveTimer` and the unload handlers, and never touches `effectActive`.

`src/stores/journal.svelte.ts:71,142,157` — all three write paths gate on exactly that
flag:

```ts
scheduleSave() { if (!this.effectActive) return; ... }   // :71
private async save() { if (!browser || !this.effectActive || ...) return; }   // :142
private saveSync() { if (!browser || !this.effectActive || ...) return; }     // :157
```

So every guard that is supposed to make a destroyed store inert reads a flag that
`destroy()` does not clear. No reproduction of the *flake* is included on purpose: the
exact trigger that produces the second write is not yet established, and a guess in
this file is what produced the existing mitigation that does not mitigate.

## Cause

`destroy()` disposes resources instead of changing state. The store's own definition of
"alive" is `effectActive`, and destruction never revokes it.

## Fix

Clear `effectActive` in `destroy()`, so the three existing guards mean what they read
like. That closes the class rather than the line: every current and future write path
already asks the same question.

Then establish whether the flake is gone before touching the test. If a second write
still appears, the remaining suspect is `save()`'s `do { ... } while (pendingSaveRequested)`
loop around `serializationService.stringifyAsync` — an await inside a fake-timer
advance can resume at a different point — and that is a separate mechanism needing its
own reproduction.

Leave alone:

- The debounce interval and the `inFlightSave` / `pendingSaveRequested` re-entrancy
  guard. Neither is implicated by the disagreement above.
- The test's assertion. `exactly one write` is the correct thing to assert; a test
  loosened to tolerate the bug would hide it.

## Acceptance criteria

- [ ] A test asserts that a destroyed store performs no write when a save is scheduled
      after `destroy()`, and fails without the fix
- [ ] `saveSync()` on a destroyed store writes nothing either — the unload path must not
      be the hole the other two close
- [ ] `journal_persistence.test.ts` passes 100 consecutive full-suite runs, or the
      remaining cause is identified and written down here
- [ ] Destroying and re-creating the store still persists normally — the fix must not
      make a fresh instance inert

## Links

- `src/stores/journal.svelte.ts:28,34,53-66,71,142,157`
- `src/stores/journal_persistence.test.ts:85-92` — the `beforeEach` comment naming the flake
- Found while verifying [`BUG-0441`](BUG-0441-legacy-alert-cold-baseline-never-fires.md) in PR #3192
