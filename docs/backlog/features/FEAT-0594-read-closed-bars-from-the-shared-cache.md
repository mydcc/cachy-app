---
id: FEAT-0594
title: Read closed bars from the shared cache without changing what a live price means
type: feature
status: specced
priority: P2
milestone: M6
editions: [pro, private]
area: market-data
data_class: C
adr: none
depends_on: [FEAT-0592, FEAT-0593]
agent_eligible: false
size: M
---

# FEAT-0594 — Read closed bars from the shared cache without changing what a live price means

## Problem

With a port (FEAT-0593) and a populated cache (FEAT-0592) in place, the read
path still has to be changed, and this is the one change in the group that can
affect money.

Three silent failures are available here, and all three have precedent in this
repository:

- **A stale price presented as live.** BUG-0558 is `done`: a stalled channel
  left the tile showing its cached price as live, and selecting the row copied
  that price into the calculator for sizing, stop distance and R:R. Its fix set
  the convention this item must not weaken — a green Live status cannot coexist
  with stale data, and a stale value cannot silently become an entry price. A
  shared cache read by a second path is exactly how that bug returns.
- **A gap read as a value.** ADR-0009 forbids collapsing "not measurable" into a
  neutral or bearish reading, and `TrendState` carries `unknown` for it. BUG-0231
  is what an empty or short candle array looks like from the outside: a panel
  that renders.
- **A cache hit that proves nothing.** `requestManager.ts:146` measures latency
  only on the venue path; a cache hit returns before the timer starts, so the
  existing telemetry cannot see the benefit and cannot see a wrong answer.

## Proposal

Cache-aside over confirmed-closed bars only, through the FEAT-0593 port.

`fetchBitunixKlines` and `ensureHistory` ask the port for `[start, lastClosed]`,
fetch only the missing ranges through the existing page walk, merge, and publish.
`marketAnalyst.loadHistory` reads the same port. The read order between
`requestManager.cache` (10s), `storageService` IndexedDB and the shared cache is
explicit and deterministic — ADR-0009's correction note is that *one cache is
better than two* is true about data and false about reactivity.

Background analysis keeps its own store (ADR-0009 rule 2). The analyst reads the
shared cache; it does not write `marketState`.

Counters attach to the existing `RequestTelemetrySink`: `cacheHit`,
`barsServed`, `venuePagesFetched` and `cacheLatencyMs` — each **per
`symbol:tf`**, because a symbol missing 100% of the time is invisible in a 94%
average. That is the same aggregation blindness ADR-0009 was written about.

## Acceptance criteria

- [ ] A read asks the port for the closed range, fetches only the gap from the
      venue, and returns bars identical to a no-cache read for the same symbol,
      timeframe and depth.
- [ ] The identity check is a test, not a review comment: same request with and
      without the cache yields equal bars, and the test goes red when the cache
      is seeded with a deliberately corrupted bar.
- [ ] A gap in the cached range produces `unknown` — never a zero, never an
      empty array read as data, never a neutral or bearish trend.
- [ ] A value read from the shared cache cannot set a green Live status, and
      cannot become a calculator entry price without the BUG-0558 disclosure.
      Covered by a test that reads from the cache and inspects both.
- [ ] `cacheHit`, `barsServed`, `venuePagesFetched` and `cacheLatencyMs` are
      recorded per `symbol:tf`, not only in aggregate. A test asserts a symbol
      with a 0% hit rate is distinguishable from the average.
- [ ] Read order across `requestManager.cache`, `storageService` and the shared
      cache is documented and covered by a test; a cache hit does not cause
      visible flicker.
- [ ] With the server unreachable, every core path behaves as it does today:
      chart, technicals, EMA 200, analyst. Proven by running the existing suites
      against `NoOpCache`.
- [ ] `marketAnalyst` reads the shared cache without writing `marketState`
      (ADR-0009 rule 2), asserted by a store-write spy.
- [ ] `npm run test:perf` reports `Kline Requests` as 0 for closed ranges with a
      warm cache, against a recorded baseline. Time is reported but is not the
      gate — the request count is, because wall-clock is not reliable on a
      shared runner (engineering-log entry 18).
- [ ] A load test at 1, 100 and 1000 concurrent clients records subscription
      count, ingest throughput, module RAM and hit rate. The numbers go into
      ADR-0022. No capacity claim ships without them.
- [ ] If the load test shows SpacetimeDB cannot carry the subscription cost, the
      item is reported as not done and ADR-0022's CDN alternative is taken up
      rather than the threshold being lowered.

## Out of scope

- Any write from a client, including write-through.
- Changing the live price path. It stays on the client WebSocket
  (ADR-0022 §1).
- Deep history beyond the hot window.
- Improving the ingestor's throughput or adding failover.
- Dashboards for the counters. The metrics exist; a UI for them is separate.
- Backtests and any other consumer of historical data.

## Open questions

None. Everything this item needs is decided by ADR-0022 and fixed by its two
dependencies.

## Links

- `docs/adr/0022-shared-hot-window-kline-cache.md` — every rule enforced here.
- `docs/backlog/bugs/BUG-0558-cached-market-quotes-seed-calculator.md` — done;
  the freshness convention this must not weaken.
- `docs/adr/0009-candle-depth-and-background-store-isolation.md` — the paging
  rule, the background-store isolation, and `unknown`-not-a-value.
- `docs/adr/0003-edition-boundary.md` — the core stays free of server imports.
- [BUG-0230](../bugs/BUG-0230-market-analyst-fetch-storm.md), [BUG-0231](../bugs/BUG-0231-synthetic-timeframe-underfetch.md),
  [BUG-0234](../bugs/BUG-0234-analyst-store-coupling-regression.md) — the silent
  failures this item is built to make impossible.
- `src/services/api/requestManager.ts:77-118,146-202` — where a cache hit
  returns before the latency timer, and where the counters attach.
- `src/services/api/telemetry.ts` — `RequestTelemetrySink`, the injection port.
- `src/services/marketAnalyst.ts:53,153` — `ANALYST_HISTORY_TARGET`,
  `loadHistory`.
- `src/services/marketWatcher/historyFetcher.ts` — `ensureHistory`.
- `src/services/storageService.ts:32` — `STORE_KLINES`, the IndexedDB cache.
- `src/tests/performance/startup_benchmark.test.ts` — `Kline Requests`,
  `Total HTTP Requests`, `Time to First Price`.
- `vitest.perf.config.ts` — why wall-clock benchmarks are local-only.
- `docs/backlog/features/FEAT-0591-http-cache-for-closed-bars.md` — the
  HTTP-layer baseline.
