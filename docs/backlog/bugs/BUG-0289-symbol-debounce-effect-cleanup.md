---
id: BUG-0289
title: Symbol debounce effect arms a setTimeout without returning cleanup
type: bug
status: in-progress
priority: P3
milestone: none
editions: [community, pro, private]
area: services
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/bug-0289-symbol-debounce-effect-cleanup
---

# BUG-0264 — Symbol debounce effect arms a setTimeout without returning cleanup

## Symptom

The second `$effect` in `src/services/appEffects.svelte.ts:47–70` arms a 500 ms
`setTimeout` for symbol changes but returns no teardown. After root disposal or
rapid re-runs, the stale timer can register watchers for a dead symbol — exactly
the duplicate-subscription class the project's Svelte-5 rules forbid ("every
`$effect` that registers listeners/subscriptions MUST return a cleanup").

## Evidence

**Derived** — from reading the effect; related timer-leak bugs
([`BUG-0079`](BUG-0079-store-subscribe-timer-leak.md),
[`BUG-0078`](BUG-0078-stores-missing-hmr-cleanup.md)) demonstrate the class is real.

## Cause

Debounce timers are easy to forget in effect teardown because nothing fails
immediately — the leak surfaces only under HMR/disposal timing.

## Fix

Return a cleanup from the effect that `clearTimeout(symbolDebounceTimer)`.

## Acceptance criteria

- [x] A test disposes the effect root inside the debounce window and asserts the
      pending callback never fires (vi.useFakeTimers) — failing before the fix
      (`src/services/appEffects_symbolDebounce.test.ts`, verified red pre-fix,
      green post-fix)
- [x] Normal debounce behaviour (single registration per settled symbol) unchanged

## Out of scope

The other effects in the file unless the same pattern is found — fix and note,
no redesign.

> **Note (2026-08-23, opencode):** Checked the other effects in the file — only
> effect #2 had the pattern. Effect #5 already returns `() => fundingRateService.stop()`;
> effects #1, #3, #4 and #6 register no timers or listeners needing teardown.
> Implementation lives on `fix/bug-0289-symbol-debounce-effect-cleanup`; item goes
> to `done` once the PR merges.

## Links

- `src/services/appEffects.svelte.ts`
- [`BUG-0078`](BUG-0078-stores-missing-hmr-cleanup.md), [`BUG-0079`](BUG-0079-store-subscribe-timer-leak.md)
- Security audit 2026-08-23, finding "symbol debounce timer has no effect cleanup" (Low)
