---
id: BUG-0442
title: A destroyed journal store can still write to localStorage
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: journal
data_class: A
adr: none
depends_on: []
branch: fix/bug-0442-journal-destroy-disarm
start_date: 2026-09-12
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

**Demonstrated.** Two tests in `journal_persistence.test.ts` fail on the unfixed store
and pass on the fixed one — verified in that order:

```
writes nothing when a mutation schedules a save after destroy → expected 1 to be +0
writes nothing when flush() is called after destroy          → expected 1 to be +0
```

Filed originally as *derived*, from two pieces of code that disagree about what
`destroy()` means.

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
`destroy()` does not clear. `settings.svelte.ts` settles whether this was a design choice: its own `destroy()`
already does `this.effectActive = false` (`settings.svelte.ts:2370`), with the same
flag name and the same guards. The journal store was the outlier, not the standard.

No reproduction of the *CI flake* is included: the two failures above are the defect
itself, and whether that defect was also the flake's trigger is a separate claim —
see "What this does and does not close" below.

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

- [x] A test asserts that a destroyed store performs no write when a save is scheduled
      after `destroy()`, and fails without the fix — verified RED (`expected 1 to be +0`)
      then GREEN
- [x] `saveSync()` on a destroyed store writes nothing either — covered by its own test
      on the `pagehide`/`beforeunload` path
- [x] `flush()` on a destroyed store writes nothing — the second RED test; `flush()`
      reaches `save()` without a timer, so the timer `destroy()` cleared was never what
      made a destroyed store safe
- [x] Destroying and re-creating the store still persists normally — `effectActive` is
      per-instance, set in the constructor, so a fresh store is live
- [ ] ~~100 consecutive full-suite runs~~ — replaced, see below: an absence of a
      load-dependent flake is not provable by a run count this repo can afford, and
      claiming it from a handful of green runs would be the dishonest half of the AC

## Fixed (2026-09-12)

One line where it belongs, plus the reason it belongs there:
`destroy()` now sets `effectActive = false` **before** disposing the timer, the effect
cleanup and the unload handlers, so nothing can re-arm between the two steps.

That closes the class rather than the line. All three write paths — `scheduleSave`,
`save`, `saveSync` — already ask the same question; they were simply being told the
wrong answer.

## What this does and does not close

**Closed:** a destroyed `JournalManager` can no longer write Class A data to
`localStorage`. That was true in the app, not only in tests — `destroy()` runs on HMR
disposal (`journal.svelte.ts:328`), and a mutation or `flush()` after it wrote the
journal from a store the app had already replaced.

**Not claimed:** that this was the cause of the CI flake in
`journal_persistence.test.ts`. The flake is load-dependent, was seen once on PR #3192,
and passed on rerun of the identical commit. This fix removes one real way a second
write could reach `localStorage` — the destroyed singleton the test's `beforeEach`
tries and failed to disarm — which makes it the best available candidate, and the test
now asserts the property directly instead of hoping. But a load-dependent flake seen
once is not shown absent by any number of green runs this repo can afford, so it is
not marked as proven here.

If it recurs, the next suspect is stated in "Fix" above: `save()`'s
`do { ... } while (this.pendingSaveRequested)` loop around an awaited
`serializationService.stringifyAsync`, which can resume at a different point inside a
fake-timer advance. The hypothesis about a shared root with
`external_routes_ssrf.test.ts` (below) stands unchanged and untested.

## A second file shows the same symptom (hypothesis, not established)

`src/tests/security/external_routes_ssrf.test.ts` fails the same way — green 4/4 in
isolation, identical to `develop`, but 2 failed in a local full parallel run, while
CI's own full run of the same commit passed. It leaks in the other direction from the
journal file: a `vi.spyOn(global, "fetch")` rather than fake timers and a store
singleton.

Both are global state surviving across the worker pool, so the two may share one root
(pool isolation, or a `restoreAllMocks` that does not run where it is assumed to).
Worth checking *before* fixing either in isolation — but this is a hypothesis from two
data points, not a diagnosis, and the `effectActive` disagreement above stands on its
own regardless of how it resolves.

## Links

- `src/stores/journal.svelte.ts:28,34,53-66,71,142,157`
- `src/stores/journal_persistence.test.ts:85-92` — the `beforeEach` comment naming the flake
- Found while verifying [`BUG-0441`](BUG-0441-legacy-alert-cold-baseline-never-fires.md) in PR #3192
