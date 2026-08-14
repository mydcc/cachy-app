---
id: FEAT-0193
title: "Decompose marketWatcher.ts into subscription registry, polling loop and history fetching"
type: feature
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: services
data_class: none
adr: none
depends_on: [BUG-0182, BUG-0183, BUG-0184]
estimate: 2
size: M
target_date: 2026-09-14
---

# FEAT-0193 — Decompose `marketWatcher.ts` into subscription registry, polling loop and history fetching

Sub-item 1 of 5 under [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md).
Read that item's "Rules that apply to every sub-item" first.

## Problem

`src/services/marketWatcher.ts` is 822 lines in a single `MarketWatcher` class
holding three unrelated responsibilities. No individual method is oversized
(largest is `ensureHistory` at 125 lines), so this is a **class-level**
decomposition, not a long-method split.

The three responsibilities, all currently interleaved in one class:

1. **Subscription registry** — `requests`, `register`, `unregister`,
   `syncChannelSubscription`, `syncSubscriptions`, `pruneZombieRequests`,
   `pruneOrphanedSubscriptions`, `prunedRequestIds`, `_subscriptionsDirty`.
   Reference-counts who needs which symbol/channel.
2. **Polling lifecycle** — `startPolling`, `resumePolling`, `stopPolling`,
   `resync`, `runPollingLoop`, `performPollingCycle`, plus the scheduling and
   concurrency state (`isPolling`, `pollingTimeout`, `startTimeout`,
   `staggerTimeouts`, `maxConcurrentPolls`, `inFlight`, `maintenanceCycles`).
3. **History fetching** — `ensureShallowHistory`, `ensureHistory`, `fillGaps`,
   `loadMoreHistory`, `pollSymbolChannel`, plus `exhaustedHistory`,
   `historyLocks`, `pendingRequests`, `requestStartTimes`.

## Proposal

Extract 1 and 3 into their own units; `MarketWatcher` keeps the polling
lifecycle and composes the other two. Suggested shape — argue with it in the
PR if the code says otherwise:

- `src/services/marketWatcher/subscriptionRegistry.ts`
- `src/services/marketWatcher/historyFetcher.ts`
- `src/services/marketWatcher.ts` — the lifecycle, wiring the two together

Behaviour-preserving. `refactor:` commits only.

### Coverage

Five test files already exist and are the baseline:
`marketWatcher.test.ts`, `marketWatcher_fillGaps.test.ts`,
`marketWatcher_hardening.test.ts`, `marketWatcher_perf.test.ts`,
`marketWatcher_resync.test.ts`. They must keep passing **unchanged** — if a
test needs editing to accommodate the split, that is a signal the public
surface moved, which this item does not allow. Say so in the PR instead of
adjusting the test.

## Acceptance criteria

- [ ] Subscription registry and history fetching each live in their own module
- [ ] `marketWatcher.ts` is under 400 lines and contains only lifecycle concerns
- [ ] No method exceeds 200 lines
- [ ] The five existing `marketWatcher*` test files pass **without being
      modified**
- [ ] `npm run check` passes with 0 errors
- [ ] `npm test` passes
- [ ] `marketWatcher.ts`'s exported API is unchanged (callers untouched), or
      each change is listed and justified here on completion

## Out of scope

- Any change to polling cadence, concurrency limits or retry behaviour.
- The exchange adapter interface ([`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md)).
- Touching any of the other four modules in [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md).

## Links

- [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md) — parent epic and shared rules
- [`docs/adr/0003-edition-boundary.md`](../../adr/0003-edition-boundary.md)
