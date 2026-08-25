---
id: FEAT-0195
title: "Decompose market.svelte.ts into cache management, update batching and kline buffers"
type: feature
status: done
branch: feat/0195-split-market-store
done_version: 1.6.0-beta.19
priority: P2
milestone: none
editions: [community, pro, private]
area: services
data_class: C
adr: none
depends_on: [BUG-0182, BUG-0183, BUG-0184, FEAT-0198]
estimate: 3
size: M
target_date: 2026-09-21
start_date: 2026-08-14
---


# FEAT-0195 — Decompose `market.svelte.ts` into cache management, update batching and kline buffers

Sub-item 3 of 5 under [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md).
Read that item's "Rules that apply to every sub-item" first.

> **Sequenced after [`FEAT-0198`](FEAT-0198-market-store-buffer-pool-characterisation-tests.md),
> not just ordered.** `depends_on` includes `FEAT-0198` so
> `scripts/jules/dispatch-backlog.mjs` will not dispatch this item until
> FEAT-0198's status is `done` on `develop`. The buffer-pool/eviction coupling
> was this item's one open question — undispatchable without test coverage
> pinning that coupling first, dispatchable once it exists.

## Problem

`src/stores/market.svelte.ts` is 1000 lines, of which `MarketManager` is the
bulk. No individual method is oversized (largest is `applyUpdate` at 127
lines), so this is a **class-level** decomposition.

Four responsibilities are interleaved:

1. **LRU cache management** — `getMaxCacheSize`, `touchSymbol`, `evictLRU`,
   `enforceCacheLimit`, `releaseSymbolBackingBuffers`, `cacheMetadata`,
   `getMaxCacheSize`.
2. **Batched update flushing** — `updateSymbol`, `flushUpdates`, `applyUpdate`,
   `pendingUpdates`, `flushIntervalId`, `lastFlushTime`.
3. **Kline buffer management** — `updateSymbolKlines`, `applySymbolKlines`,
   `backingBuffers`, `pendingKlineUpdates`, `bufferPool`.
4. **Telemetry** — `telemetry`, `updateTelemetry`, `recordApiCall`,
   `telemetryIntervalId`.

Responsibility 3 owns pooled `Float64Array`s whose lifetime is coupled to 1's
eviction path (`releaseSymbolBackingBuffers`). That coupling is the reason
this split needs care: getting it wrong leaks buffers or frees live ones,
and neither shows up as a failing assertion.

## Proposal

Extract 1, 3 and 4; `MarketManager` keeps the reactive `$state` surface and
the update path. Suggested shape — argue with it in the PR if the code says
otherwise:

- `src/stores/market/symbolCache.ts` — LRU bookkeeping and eviction
- `src/stores/market/klineBuffers.ts` — pooled buffer lifecycle
- `src/stores/market/telemetry.svelte.ts`
- `market.svelte.ts` — `$state`, `updateSymbol`/`flushUpdates`/`applyUpdate`

Buffer ownership must stay explicit: whichever unit ends up calling
`bufferPool.release()` owns it, and eviction calls into that unit rather than
reaching into its internals.

Behaviour-preserving. `refactor:` commits only.

### Coverage

Three test files exist and are the baseline: `market.test.ts`,
`marketStore.test.ts`, `marketStore_limits.test.ts`
(`marketStore_limits.test.ts` covers the eviction path specifically). They
must keep passing **unchanged**. Buffer-pool acquire/release pairing is
covered by [`FEAT-0198`](FEAT-0198-market-store-buffer-pool-characterisation-tests.md),
which must land first — do not move buffer-pool code without that coverage
already merged on `develop`.

## Acceptance criteria

- [x] Cache management, kline buffers and telemetry each live in their own module
- [x] `market.svelte.ts` is under 400 lines (356)
- [x] No method exceeds 200 lines
- [x] The three existing market store test files pass **without being modified**
- [x] `npm run check` passes with 0 errors
- [x] `npm test` passes
- [x] The store's exported API is unchanged (callers untouched), or each change
      is listed and justified here on completion — `MarketManager.getMaxCacheSize`
      and `touchSymbol` widened from `private` to `public` so the extracted
      `applyUpdate`/`legacyUpdates` modules can call them. No external
      consumer of `marketState` reached these before or reaches them now, so
      this is inert for callers.

## Out of scope

- Any change to cache size limits, eviction policy or flush cadence.
- Touching any of the other four modules in [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md).

## Links

- [`FEAT-0198`](FEAT-0198-market-store-buffer-pool-characterisation-tests.md) — prerequisite, must be `done` first
- [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md) — parent epic and shared rules
- [`docs/adr/0003-edition-boundary.md`](../../adr/0003-edition-boundary.md)
- [`docs/adr/0004-spacetimedb-data-scope.md`](../../adr/0004-spacetimedb-data-scope.md) —
  market data is Klasse C, but which symbols a user watches is not
