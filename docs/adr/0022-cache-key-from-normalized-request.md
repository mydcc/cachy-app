# ADR-0022: A cache key is derived from a normalized request, not from the URL

- **Status:** Proposed
- **Date:** 2026-09-29
- **Deciders:** opencode (implementation), to be reviewed

## Context

`/api/klines` is the hottest route the app has. Every request it receives
becomes exactly one request to the venue, from Cachy's single IP, through a
route with no rate limit, no in-flight coalescing and no cache.

The reason is not a missing feature. It is one argument at two call sites.

`src/services/marketWatcher/historyFetcher.ts:70` and `:128`:

```ts
fetchBitunixKlines(symbol, tf, limit, undefined, Date.now())
```

`endTime` is millisecond-precision. Two clients a second apart, or the same
client twice in a second, produce two different URLs. A cache keyed on the
request — the URL, the query string, the parameter list — can therefore never
hit, whatever its TTL. This is not a tuning problem; it is the key derivation.

The infrastructure to fix it already exists. `src/lib/server/cache.ts` is a
`MemoryCache` with TTL and in-flight coalescing, in production use by five
sibling routes: `/api/tickers`, `/api/funding-rate`, `/api/trading-pairs`,
`/api/position-tiers`, `/api/bitget/contracts`. `/api/klines` is the one hot
route that does not use it.

Two facts about the codebase constrain the fix.

**The cache holds no unbounded growth today, and the kline key would break
that.** `MemoryCache` deletes an entry only when *that same key* is read again
after expiry. For its five callers — a handful of long-lived, high-repetition
keys — that is fine. Kline keys rotate once per candle per symbol per
timeframe, so they would accumulate without limit. The bound is therefore part
of this decision, not a follow-up.

**`ensureHistory` already has a local cache.** `storageService.ts:32`
persists candles to IndexedDB in 1000-candle chunks, and `ensureHistory` reads
that store before it fetches, returning early when the depth is already there.
A user with a warm device cache therefore makes zero requests, and this change
does not affect that. What it changes is everything the device cache does not
cover: the first visit, a new device, a cleared store, and the second user's
cold start hitting the same bar the first one already warmed.

## Decision

A kline response is cached under a key derived from the request after the
window has been floored to the candle it falls in, and its TTL is the lifetime
of that candle.

Concretely:

- `end` floors down to the candle boundary for the requested interval. A
  request with no `end`, or one inside the forming candle, resolves to the
  candle currently in progress.
- `start` goes in raw, never floored: the venue is called with the caller's
  value verbatim, so two requests with the same `end` but different `start`
  ask for different windows and must not share a key. (Flooring it once let
  the second caller be served the first caller's answer.) The backfill always
  sends `start=1`, so real traffic still shares keys.
- Every field that changes the answer is in the key, `priceSource` included.
  A mark-price series and a last-price series for one symbol are different
  answers, and serving one for the other is the bug BUG-0558 is about.
- A rolling window's TTL is the remaining lifetime of the forming candle. A
  window ending *strictly before* that candle is historical and gets a flat
  five minutes.
- The cache derives the key. The venue is called with the caller's request
  verbatim, unchanged.
- `limit` is clamped where it is read, to the largest value a caller can
  legitimately use.

The kline cache is a separate `MemoryCache` instance from the shared
singleton, with its own bound. One map for both would let a burst of kline
traffic evict the ticker and funding-rate entries — the two a user sees a
stale price because of.

## Consequences

### What this enables

Requests made during the same candle share one upstream call, so the number of
venue calls tracks the number of candles rather than the number of clients.

The cost is bounded and measurable. A miss costs exactly what it costs without
a cache: one venue request. So a bound that is too low costs throughput, never
correctness.

### What this costs

- The route now holds state. Its tests must clear the cache between cases,
  which they now do.
- A rolling entry serves the forming bar as of the first request in that bar.
  That bar's close is not a settled value in the first place, and the TTL
  expires it at the bar's close rather than later. The live price does not come
  from here: it arrives over the venue's WebSocket, direct from the browser.
- `MemoryCache` evicts in insertion order, not least-recently-used. For the
  rotating kline keys that is the cheaper property; the comment in
  `cache.ts` says so, because a future reader will otherwise "fix" it.

### What is now forbidden

- **Keying a cache on a request that carries `Date.now()`.** The key must
  name the bar, not the instant. This is the rule the whole change exists to
  establish, and a future caller adding `endTime = Date.now()` to a *different*
  cache reintroduces the same zero hit rate.
- **Treating a window that ends inside the forming candle as historical.** It
  carries a bar the venue is still writing. Freezing it for minutes pins a
  value that has not settled.
- **Serving a mark-price response to a last-price request, or the reverse.**
  `priceSource` is in the key.
- **Reading a kline response to set a Live indicator or a calculator entry
  price.** That is BUG-0558, and a cache in front of the read path is how it
  comes back.
- **Growing a `MemoryCache` key space without a bound.** An entry is removed
  only when its own key is re-read after expiry, so a rotating key space needs
  `maxEntries`.

## Alternatives considered

**A SpacetimeDB table of closed bars, fed by a server-side ingestor.** Proposed
and rejected in #3740, which is closed. Closed bars are facts to be *read* over
HTTP, not state changes to be *subscribed* to; SpacetimeDB is a push system for
the latter. The design also created three problems a cache does not have —
retention becoming data loss when a symbol leaves an operator-curated list, a
fail-open path costing 20 sequential pages for a 12m timeframe, and an ingestor
clock drifting from the exchange clock so that `revision` became a permanent
state rather than an exception. It also required infrastructure the deployment
does not have.

**An nginx `proxy_cache` block in front of `/api/klines`.** Effective, and it
was the fallback the previous draft named. Rejected for now: the nginx
configuration is not in the repository, so no developer and no CI run would
see the change, and the venue's terms question about serving a cached response
behind a spoofed `User-Agent` cannot be answered from the code. The in-process
cache asks neither. This remains the right next step if the in-process bound
turns out to be the binding constraint.

**Normalizing the `endTime` the client sends, instead of only the key.** Would
make the venue request itself bar-aligned. Rejected as scope: it changes what
the venue is asked for, on the market-data path, for a benefit the key already
delivers.

**Nothing, leaving the route as it is.** Every request is a venue request. This
is the status quo and the only option that needs no decision.
