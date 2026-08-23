---
id: FEAT-0258
title: Make app.saveJournal() the single debounced writer for journal persistence
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: services
data_class: A
adr: none
depends_on: []
---

# FEAT-0258 — Make app.saveJournal() the single debounced writer for journal persistence

## Problem

Two competing writers persist the trade journal to the same localStorage key:

1. `src/stores/journal.svelte.ts`: the auto-save `$effect` (~L27–31) calls
   `save()` (~L88–105) synchronously on **every** mutation — full
   `JSON.stringify` of up to 1000 entries plus a synchronous localStorage write
   on the main thread, no debounce, no dirty check. The settings store by
   contrast debounces 500 ms and dirty-checks (`settings.svelte.ts` save path).
2. `src/services/app.ts` mutators (`addTrade`, `updateTrade`, … ~L148–180) call
   both `app.saveJournal()` (idle-scheduled, async stringify) **and**
   `journalState.set(...)` — which triggers writer 1 too → double serialization
   per operation.

Consequence: main-thread jank on every journal edit/close with large journals,
plus redundant double serialization. A benchmark exists
(`tests/benchmarks/saveJournal.bench.ts`) but is excluded from CI runs.

Evidence basis: demonstrated by reading the code (both paths verified);
performance impact not runtime-profiled (Architect review, 2026-08-23).

## Proposal

Make `app.saveJournal()` the single writer (already idle-scheduled + async);
remove the store-level synchronous `$effect` save or convert it to the
settings-store pattern (500 ms debounce + dirty check). Add the
characterization test **first**, then refactor behind it.

This is Class-A data: persistence correctness outranks the perf win.

## Acceptance criteria

- [ ] Characterization test proves exactly one persistence write per mutation
      burst (fails before the fix, passes after).
- [ ] No synchronous whole-journal `JSON.stringify` on the main thread during
      mutations.
- [ ] Quota-error path intact: `StorageHelper.safeSave` retry still surfaces the
      `journal.saveFailed` toast.
- [ ] Journal data survives a reload after the last mutation within the debounce
      window (eventual write proven by test).
- [ ] Paper-trade filtering in `addEntry` behaves exactly as before.
- [ ] Nothing new leaves the device (data_class A, ADR-0001 respected).
- [ ] `npm run check` + targeted store/app tests pass.

## Out of scope

- Journal UI redesign (FEAT-0251, in progress).
- Journal schema changes; backup logic (FEAT-0212, already done).
- Touching the settings persistence path beyond pattern reference.

## Open questions

None blocking — choosing between "remove store save" vs "debounce it" happens
during implementation; both satisfy the acceptance criteria.

## Links

- `src/stores/journal.svelte.ts`, `src/services/app.ts`
- Pattern reference: `src/stores/settings.svelte.ts` save path
- `tests/benchmarks/saveJournal.bench.ts`
- Source: Autonomous Optimization Architect review, 2026-08-23.
