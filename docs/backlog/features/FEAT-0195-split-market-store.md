---
id: FEAT-0195
title: "Decompose market.svelte.ts into cache management, update batching and kline buffers"
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: services
data_class: C
adr: none
depends_on: [BUG-0182, BUG-0183, BUG-0184]
estimate: 3
size: M
target_date: 2026-09-21
---

# FEAT-0195 — Decompose `market.svelte.ts` into cache management, update batching and kline buffers

Sub-item 3 of 5 under [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md).
Read that item's "Rules that apply to every sub-item" first.

## Problem

`src/stores/market.svelte.ts` is 1000 lines, of which `MarketManager` is the
bulk. No individual method is oversized (largest is `applyUpdate` at 127
lines), so this is a **class-level** decomposition.

Four responsibilities are interleaved:

1. **LRU cache management** — `getOrCreateSymbol`, `touchSymbol`, `evictLRU`,
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
- `src/stores/market/telemetry.ts`
- `market.svelte.ts` — `$state`, `updateSymbol`/`flushUpdates`/`applyUpdate`

Buffer ownership must stay explicit: whichever unit ends up calling
`bufferPool.release()` owns it, and eviction calls into that unit rather than
reaching into its internals.

Behaviour-preserving. `refactor:` commits only.

### Coverage

Three test files exist and are the baseline: `market.test.ts`,
`marketStore.test.ts`, `marketStore_limits.test.ts`
(`marketStore_limits.test.ts` covers the eviction path specifically). They
must keep passing **unchanged**. Coverage of the buffer-pool lifecycle is
thinner than the eviction logic — add characterisation tests for
acquire/release pairing **before** moving that code.

## Acceptance criteria

- [ ] Cache management, kline buffers and telemetry each live in their own module
- [ ] `market.svelte.ts` is under 400 lines
- [ ] No method exceeds 200 lines
- [ ] Buffer acquire/release pairing has explicit test coverage, added before
      the buffer code was moved
- [ ] The three existing market store test files pass **without being modified**
- [ ] `npm run check` passes with 0 errors
- [ ] `npm test` passes
- [ ] The store's exported API is unchanged (callers untouched), or each change
      is listed and justified here on completion

## Out of scope

- Any change to cache size limits, eviction policy or flush cadence.
- Touching any of the other four modules in [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md).

## Open questions

- **Dispatch route not yet decided.** Coverage is adequate for the eviction
  path but thin for buffer-pool lifetime, and the cache/buffer coupling is the
  one genuinely subtle part of this decomposition. Either add the missing
  characterisation tests manually first and then dispatch, or keep the whole
  item manual. Needs a call before this goes to `ready`.

## Links

- [`FEAT-0190`](FEAT-0190-epic-split-god-functions.md) — parent epic and shared rules
- [`docs/adr/0003-edition-boundary.md`](../../adr/0003-edition-boundary.md)
- [`docs/adr/0004-spacetimedb-data-scope.md`](../../adr/0004-spacetimedb-data-scope.md) —
  market data is Klasse C, but which symbols a user watches is not
