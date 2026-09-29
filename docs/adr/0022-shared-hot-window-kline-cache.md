# ADR-0022: Closed bars are cached once, on a curated hot window, never as a price

- **Status:** Proposed
- **Date:** 2026-09-29
- **Deciders:** @mydcc

## Context

Every client fetches its own history. `src/services/marketAnalyst.ts:53` declares
`ANALYST_HISTORY_TARGET = 600` — three times the EMA 200 period, because an EMA seeded on
200 bars is dominated by its seed. Bitunix caps every kline response at
`BITUNIX_MAX_ROWS_PER_REQUEST = 200` and signals nothing (`src/services/api/marketData.ts`),
so 600 bars is three sequential pages. Four favourites across four timeframes is roughly 48
requests on a cold dashboard, and `RequestManager` allows 8 in flight behind a 5 req/s
limiter (`src/services/api/requestManager.ts:60,66`). ADR-0009 already paid for the
consequences of that shape: BUG-0230, BUG-0231 and BUG-0234 were all silent — a fetch that
delivered a third of what it promised threw no error, so the analyst read a trend it could
not compute as `neutral` and retried forever.

SpacetimeDB is already integrated for Global Chat (`server/spacetimedb/`,
`src/services/cloudService.ts`). ADR-0004 section 2 defines Class C and admits exactly this
data, with one condition that keeps the class real rather than a loophole: *a Class C row
may not carry, or be joinable to, a user identity.*

Three facts from the code shape this decision, and two of them argue against it.

**Exchange rate limits make server-side polling impossible.** `new RateLimiter(5, 1)` for
Bitunix and `new RateLimiter(20)` for Bitget (`requestManager.ts:66-68`) cap HTTP fetching
per process. Polling 300 symbols across 6 timeframes once per second is 1800 requests per
second — 360x over the Bitunix limit. Even 300 symbols at one timeframe is 60x over. A 1s
poll loop is arithmetically unavailable, not merely a tuning problem.

**SpacetimeDB is not a time-series store.** It is in-memory with no time-based
partitioning, and ADR-0003 requires a serverless build to keep working. A hot window of
2000 bars per `symbol:tf` across 300 symbols and 6 timeframes is roughly 600k rows —
bounded and provisionally tractable. Years of 1m history is an order of magnitude beyond
that and belongs in a columnar layout.

**The failure mode that argues hardest against any shared cache is not theoretical.**
BUG-0558 is `done`: a market channel stopped updating, the tile kept showing its cached
price as live, and selecting that row silently copied a stale price into the calculator for
sizing, stop distance and R:R. Its fix established the convention this ADR reuses — values
beyond a named maximum age are marked stale, a green Live status cannot coexist with stale
row data, and a stale value cannot silently become a calculator entry price. Its out-of-scope
section names *"public-market-data storage architecture"* as deliberately not addressed.
This ADR is that architecture, and it inherits the constraint.

## Decision

### 1. Only closed bars are cached, and the live price never is

A bar is written when `openTime < currentBar.openTime` — the next bar has opened and the
previous one is final. This is the confirmed-close rule every exchange API and backtester
uses. The bar a venue is still rewriting is never persisted, and the live price never comes
from the cache under any circumstance. The client WebSocket path (`src/services/bitunixWs.ts`,
`src/services/bitgetWs.ts`) remains the single source of price and stays independent of the
server.

The reasoning is not conservatism. A cached price one second stale is a price that never
existed on the market, and the user cannot see that it is stale while it is being used. A
60-second-old chart price is visibly old and harmless; a 1-second-old entry price is neither,
and it feeds position size.

### 2. A closed bar is written once; a correction is a revision, not an overwrite

If `symbol:tf:openTime` already exists and the venue returns a different value, the stored
bar is **not** replaced. The revision counter increments, the original value is retained, the
divergence is logged. Exchange restatements are rare, and rarity is exactly why they must be
visible: a value that may already have fed a position calculation does not change silently
underneath it. Every bar carries `source`, `fetched_at` and `revision`.

### 3. The symbol universe is curated by the operator and has no default

The ingestor covers a configured list of `symbol:tf` pairs. Nothing triggers an ingest on
demand. ADR-0004 names *which symbols a user watches* and *when they looked* as user data;
an on-demand trigger would hand the server exactly that signal even though no client wrote a
row. ADR-0004's localhost amendment (2026-08-25) permits a localhost default host; it does
not permit a default symbol list.

A symbol not on the list has no cache and is fetched from the venue on the fail-open path.
The operator's list is a deliberate trade between hit rate and watchlist privacy, and it has
to be observable per symbol — a symbol missing 100% of the time is invisible in a 94% average.

### 4. The client reaches the cache through a port, never through `cloudService`

Core code does not import `src/lib/spacetimedb/` or `src/services/cloudService.ts`
(ADR-0003 section 1). It reaches a `MarketHistoryCache` interface whose offline
implementation is a no-op. The cache is an accelerator: unreachable means the client fetches
from the venue and nothing else changes. No core path may fail, degrade or warn because the
cache is down.

### 5. A gap in the history is `unknown`, never a value

A missing range produces the `unknown` state ADR-0009 already requires for an unmeasurable
reading — never a zero, never an empty array read as "no data", never a neutral or bearish
trend. An empty candle array renders an RSI(14) panel that looks functional while fed nothing.

## Consequences

### What this enables

- EMA 200 and other long-look-back indicators converge on a cold start instead of reporting
  `neutral` — the defect behind BUG-0231 stops being reachable.
- Cold start, symbol switches, second devices and new tabs stop costing venue requests.
  `src/tests/performance/startup_benchmark.test.ts` already reports `Kline Requests` and
  `Total HTTP Requests` and is the measurement point.
- The AI direction gets a shared source for market data, which ADR-0004 section 4 permits for
  Class C.
- 1000 concurrent users each issuing 48 cold-start requests is 48k requests against a 5 req/s
  limiter. The cache does not remove that problem — it moves the threshold at which it occurs,
  and that is recorded here rather than promised away.

### What this costs

- **A third cache.** `requestManager.cache` (10s TTL, 100 entries) and `storageService`
  IndexedDB already exist. ADR-0009's correction note warns that *one cache is better than
  two* is true about data and false about reactivity. Read order between the three must be
  explicit and deterministic or the UI flickers.
- **A second socket layer.** FEAT-0227 (adapter owns its socket) is `done`, so the ingestor
  attaches to the existing adapters in `src/services/exchange/` rather than opening its own
  connections. More work than a standalone aggregator, and the right price.
- **The boot rebuild is bounded by `MAX_KLINE_PAGES = 20`.** 2000 bars at 200 rows per page
  is 10 pages, fitting 1m/5m/15m. A 12m timeframe needs 36 and hits the cap. Per-timeframe
  depth is an open question in FEAT-0592.
- **The benefit is almost entirely a cold-start benefit.** In steady state the user sees no
  difference — the live path is untouched. The durable value is that indicators are correct
  and the chart is not visibly loading.
- **An unmeasured scale claim.** No 1000-CCU numbers exist in this repository. Subscription
  cost, ingest throughput and module RAM must be measured before any capacity statement.

### What is now forbidden

- Serving a live or forming price from the cache, under any degradation story.
- Marking a green Live status from a cached value, or letting one become a calculator entry
  price without the BUG-0558 disclosure. A shared cache that reconstructs BUG-0558 through a
  second path is a regression, not a feature.
- Overwriting a stored closed bar. Corrections increment `revision` and keep the original.
- Triggering an ingest from a client request, or adding a default, suggested or auto-discovered
  symbol list.
- Importing `cloudService` or the generated bindings into `marketData.ts`, `historyFetcher.ts`,
  `marketAnalyst.ts`, `storageService.ts` or any other core file.
- Collapsing a cache miss into a value, a neutral trend, or an empty array treated as data.
- Publishing a capacity figure for this cache that has not come from a recorded load test.

## Alternatives considered

**Let each client cache its own history, extending the 10s TTL.** Rejected: it does not
reduce venue load at all, only moves the eviction point, and leaves the 48-request cold start
per user untouched. It cannot help a second device or a new tab.

**On-demand ingest — the first client request starts collecting a symbol.** Rejected: no
client writes a row, so it is not a Class A leak in the literal sense, but it hands the server
a watchlist and a timestamp for every request. ADR-0004 forbids exactly that inference.

**HTTP polling on a 1s interval in the server.** Rejected on arithmetic: 1800 requests per
second against a documented 5 req/s limiter. Aggregation over an existing venue WebSocket
costs two connections total, independent of symbol count.

**Store years of 1m history.** Rejected as an in-memory table. A reasonable future item with
a columnar store behind its own ADR; in SpacetimeDB it would trade a bounded cache for an
unbounded RAM bill.

**Write-through from clients, letting the first fetch populate the shared table.** Rejected:
at 1000 CCU every client fetches and writes the same bars, duplicating the work 1000-fold.
The server owns the writes; clients only read.

**A CDN or object-store cache for immutable closed bars instead of SpacetimeDB.** Not
rejected on merit — for immutable data it is genuinely cheaper, with no RAM bill and no
subscription cost. It loses the push path (a closed bar delivered to subscribers on write)
and adds an external service dependency. It remains the fallback if the load test shows
SpacetimeDB cannot carry the subscription cost at target concurrency. FEAT-0591 delivers the
same latency win at the HTTP layer and is the honest first step in either direction.

**Cache live prices with an age label, and let the UI show the age.** Rejected: a correct
label is not a guarantee. BUG-0558's fix proves a label can be present and still be bypassed
by a user clicking a row, and no labelling makes a stale entry price safe to size against.

## Open questions

- Per-timeframe depth of the hot window, given `MAX_KLINE_PAGES = 20` bounds the boot
  rebuild (FEAT-0592).
- Whether SpacetimeDB's subscription cost is viable at target concurrency. Unmeasured; belongs
  in the load test recorded against FEAT-0594.
