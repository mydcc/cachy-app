---
id: FEAT-0196
title: "Cover activeTechnicalsManager with characterisation tests, then split it"
type: feature
status: in-progress
priority: P2
milestone: none
editions: [community, pro, private]
area: services
data_class: none
adr: none
depends_on: [BUG-0182, BUG-0183, BUG-0184]
estimate: 3
size: M
target_date: 2026-09-21
---

# FEAT-0196 — Cover `activeTechnicalsManager` with characterisation tests, then split it

Sub-item 4 of 5 under [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md).
Read that item's "Rules that apply to every sub-item" first.

> **Manual only — do not dispatch to an agent.** See "Why this stays manual".

## Problem

`src/services/activeTechnicalsManager.svelte.ts` is 730 lines with **zero test
files**. No individual method is oversized (largest is `performCalculation` at
112 lines, then `scheduleCalculation` at 105), so this is a class-level
decomposition — but the absence of tests is the real problem, independent of
the split.

Four responsibilities are interleaved in `ActiveTechnicalsManager`:

1. **Subscriber ref-counting** — `subscribers`, `register`, `unregister`,
   `forceRefresh`. Decides which symbol/timeframe pairs are live.
2. **Tab-visibility lifecycle** — `isTabVisible`, `visibleSymbols`,
   `handleVisibilityChange`, `pauseNonCriticalCalculations`,
   `resumeCalculations`, `pausedCalculations`, `setSymbolVisibility`.
3. **Scheduling and throttling** — `throttles`, `activeEffects`,
   `scheduleCalculation`.
4. **Calculation execution** — `performCalculation`,
   `prepareBuffersWithRealtime`, `isTechnicalsEqual`, `workerState`, `pool`.

### Why this stays manual

[`FEAT-0190`](FEAT-0190-epic-split-god-functions.md)'s central requirement is
that every split is **behaviour-preserving**. With no tests, that claim cannot
be demonstrated — a dispatched refactor here would be graded on "CI is green",
and CI is green today regardless of what this file does. Beyond that, the
responsibilities most likely to break are the ones hardest to notice: this
class registers `$effect`s and `visibilitychange` listeners and owns pooled
buffers, so a mis-split leaks timers or buffers silently rather than failing
a test. CLAUDE.md's rule that every `$effect` registering a listener returns a
cleanup function is exactly what a mechanical extraction tends to drop.

## Proposal

**Two PRs, in this order. The first is not optional.**

**PR 1 — characterisation tests.** No production code changes. Cover at
minimum:

- register/unregister ref-counting, including that the last `unregister`
  tears down the effect and the throttle
- `setSymbolVisibility` and the tab-visibility pause/resume path, including
  that the active symbol keeps calculating while others pause
- throttle scheduling: that a burst of updates coalesces
- buffer acquire/release pairing across `prepareBuffersWithRealtime`
- effect and listener cleanup: no leaked timers or `visibilitychange`
  listeners after teardown (`bitunixWs.leak.test.ts` is the pattern to copy)

**Finding from PR 1:** `prepareBuffersWithRealtime` has no callers anywhere in
this file — it's private with zero call sites, i.e. dead code today. It also
calls `this.pool.acquire()` six times but never calls `this.pool.release()`
on the buffers it replaces, so if it were ever wired up, buffers would flow
into the pool but never back out. PR 1's characterisation tests pin this
as-is (isolated calls to the method, not a live code path) rather than fixing
it — that's a behaviour change, out of scope here. Whoever does PR 2 should
decide deliberately whether to keep carrying this dead method forward or
drop it, not carry it forward by default because it was there before.

**PR 2 — the split.** Suggested shape, once PR 1 pins the behaviour:

- `src/services/activeTechnicals/subscriptionRegistry.ts` (1)
- `src/services/activeTechnicals/visibilityController.ts` (2)
- `activeTechnicalsManager.svelte.ts` — scheduling (3) and execution (4)

Behaviour-preserving. `refactor:` commits only in PR 2.

## Acceptance criteria

- [x] A characterisation test file exists covering ref-counting, visibility
      pause/resume, throttle coalescing, buffer pairing and teardown cleanup
      (`src/services/activeTechnicalsManager.test.ts`)
- [ ] Those tests were written and merged **before** any production code moved
      (PR 1 merged; PR 2 — the split — not started)
- [ ] Subscriber registry and visibility control each live in their own module
- [ ] `activeTechnicalsManager.svelte.ts` is under 400 lines
- [ ] No method exceeds 200 lines
- [ ] Every `$effect` registering a listener or subscription still returns a
      cleanup function after the split
- [ ] `npm run check` passes with 0 errors
- [ ] `npm test` passes
- [ ] The exported API is unchanged (callers untouched), or each change is
      listed and justified here on completion

## Out of scope

- Any change to throttle intervals, the update-mode heuristic
  (`technicalsUpdateMode`) or engine selection.
- Touching any of the other four modules in [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md).

## Links

- [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md) — parent epic and shared rules
- `src/services/bitunixWs.leak.test.ts` — the leak-test pattern to copy for
  the teardown coverage
