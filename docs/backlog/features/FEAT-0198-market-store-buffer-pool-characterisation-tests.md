---
id: FEAT-0198
title: "Add characterisation tests for market.svelte.ts's buffer-pool acquire/release pairing"
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: services
data_class: C
adr: none
depends_on: [BUG-0182, BUG-0183, BUG-0184]
estimate: 1
size: S
target_date: 2026-09-18
---

# FEAT-0198 — Add characterisation tests for `market.svelte.ts`'s buffer-pool acquire/release pairing

Prerequisite for [`FEAT-0195`](FEAT-0195-split-market-store.md) (sub-item 3 of 5
under [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md)). Read FEAT-0190's
"Rules that apply to every sub-item" first.

> **This item exists only to unblock FEAT-0195's "Open questions" note.**
> FEAT-0195's decomposition couples pooled `Float64Array` buffer lifetime
> (`backingBuffers`, `bufferPool`) to the LRU eviction path
> (`releaseSymbolBackingBuffers`) — the one genuinely subtle part of that
> split. `market.test.ts`, `marketStore.test.ts` and
> `marketStore_limits.test.ts` already cover the eviction path itself, but not
> buffer acquire/release pairing specifically, so FEAT-0195 could not
> demonstrate "behaviour-preserving" for that coupling. This item closes that
> gap with tests only, no production code changes, so FEAT-0195 can proceed
> through the normal agent-dispatchable route once this is `done`.

## Problem

`src/stores/market.svelte.ts`'s kline buffer pool (`bufferPool`,
`backingBuffers`, `pendingKlineUpdates`) hands out and reclaims pooled
`Float64Array`s, and `releaseSymbolBackingBuffers` (called from the LRU
eviction path) is the one place that frees them. Nothing in the current three
test files pins:

- that every acquired buffer is eventually released exactly once (no leak,
  no double-release),
- that a buffer released via eviction is not still referenced/written to by
  in-flight kline updates,
- that `pendingKlineUpdates` and `backingBuffers` stay consistent across an
  acquire → update → evict → re-acquire cycle for the same symbol.

## Proposal

Add characterisation tests only — **no production code changes** — to a new
or existing `market*.test.ts` file, covering the acquire/release pairing
above against `market.svelte.ts`'s current, unmodified behaviour. These tests
become the contract FEAT-0195's extraction must preserve.

`refactor:`-only rule from FEAT-0190 doesn't apply here since this item adds
tests, not a refactor — use `test:` as the commit type.

## Acceptance criteria

- [x] A test file exists covering buffer acquire/release pairing across the
      acquire → update → evict → re-acquire cycle
- [x] Tests demonstrate no leak (every acquired buffer is eventually
      released) and no use-after-release
- [x] No production code in `market.svelte.ts` changes
- [x] The three existing market store test files (`market.test.ts`,
      `marketStore.test.ts`, `marketStore_limits.test.ts`) pass **without
      being modified**
- [x] `npm run check` passes with 0 errors
- [x] `npm test` passes

## Out of scope

- Any change to cache size limits, eviction policy, flush cadence, or the
  buffer pool's implementation itself.
- The actual decomposition — that's [`FEAT-0195`](FEAT-0195-split-market-store.md).

## Links

- [`FEAT-0195`](FEAT-0195-split-market-store.md) — the item this unblocks
- [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md) — parent epic and shared rules
