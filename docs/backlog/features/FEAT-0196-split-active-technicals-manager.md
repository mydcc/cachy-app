---
id: FEAT-0196
title: "Cover activeTechnicalsManager with characterisation tests, then split it"
type: feature
status: done
done_version: 1.6.0-beta.19
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

**Deviation from the suggested shape, argued as the Proposal invites:**
keeping "scheduling (3) and execution (4)" together in
`activeTechnicalsManager.svelte.ts` cannot satisfy the under-400-lines
criterion below — `performCalculation` (112), `isTechnicalsEqual` (69),
`prepareBuffersWithRealtime` (68) and `injectRealtimePrice` (41) alone are
~290 lines, on top of scheduling. Same shape as FEAT-0195's own
`applySymbolKlines` finding: the epic's line-count assumptions about this
file didn't survive contact with the actual code. Extracted a third module,
`src/services/activeTechnicals/calculationExecutor.ts`, holding
responsibility 4 (`performCalculation`, `prepareBuffersWithRealtime`,
`isTechnicalsEqual`, `handleResult`, `injectRealtimePrice`, `workerState`,
`pool`) plus `forceRefresh` (categorised under responsibility 1 in this
item's own list, but it only ever touches `workerState` and calls
`performCalculation` — nothing to do with the `subscribers` map — so it
moved with execution instead, where it actually belongs).

`activeTechnicalsManager.svelte.ts` ends up as the pure orchestrator:
construction/wiring of the three collaborators, `startMonitoring`/
`stopMonitoring` (the `$effect.root` lifecycle), `scheduleCalculation`, and
the four public passthroughs (`register`, `unregister`, `forceRefresh`,
`setSymbolVisibility`).

**Keeping PR 1's tests passing unmodified required delegation, not just
extraction.** `activeTechnicalsManager.test.ts` asserts directly on internal
state by name (`subscribers`, `visibleSymbols`, `pausedCalculations`,
`isTabVisible`, `workerState`, `pool`, `handleVisibilityChange`,
`prepareBuffersWithRealtime`) via a type-cast, the same pattern
`bitunixWs.leak.test.ts` uses. Since that state now lives on the three
extracted collaborators, `ActiveTechnicalsManager` exposes it back under the
same names via thin `private get`/`set` accessors that delegate to
`this.registry`/`this.visibility`/`this.executor`. The state and behaviour
genuinely moved; these accessors are pass-throughs for the already-merged
test contract, not a parallel re-implementation.

## Acceptance criteria

- [x] A characterisation test file exists covering ref-counting, visibility
      pause/resume, throttle coalescing, buffer pairing and teardown cleanup
      (`src/services/activeTechnicalsManager.test.ts`)
- [x] Those tests were written and merged **before** any production code moved
      (PR 1 merged as a separate PR, before PR 2 touched any production code)
- [x] Subscriber registry and visibility control each live in their own module
      (`src/services/activeTechnicals/subscriptionRegistry.ts`,
      `visibilityController.ts` — plus `calculationExecutor.ts` for
      responsibility 4, see the deviation note above)
- [x] `activeTechnicalsManager.svelte.ts` is under 400 lines (346)
- [x] No method exceeds 200 lines (largest is `performCalculation` at 113,
      moved into `calculationExecutor.ts`)
- [x] Every `$effect` registering a listener or subscription still returns a
      cleanup function after the split (the `$effect.root` in
      `startMonitoring`/`stopMonitoring` is untouched; `VisibilityController`'s
      `document.addEventListener('visibilitychange', ...)` has no
      corresponding removal, same as before the split — it's a singleton-
      lifetime listener with no teardown path either way, not a regression)
- [x] `npm run check` passes with 0 errors
- [x] `npm test` passes (full suite, 1146 tests, including PR 1's
      characterisation tests unmodified)
- [x] The exported API is unchanged (callers untouched) — verified against
      all four call sites (`TechnicalsPanel.svelte`, `MarketOverview.svelte`,
      `marketWatcher/historyFetcher.ts`, `actions/viewport.ts`): each uses
      only `register`/`unregister`/`forceRefresh`/`setSymbolVisibility`,
      unchanged

## Out of scope

- Any change to throttle intervals, the update-mode heuristic
  (`technicalsUpdateMode`) or engine selection.
- Touching any of the other four modules in [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md).

## Links

- [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md) — parent epic and shared rules
- `src/services/bitunixWs.leak.test.ts` — the leak-test pattern to copy for
  the teardown coverage
