---
id: FEAT-0592
title: Populate a shared closed-bar cache from one venue socket per exchange
type: feature
status: specced
priority: P2
milestone: M6
editions: [pro, private]
area: exchange
data_class: C
adr: ADR-0022
depends_on: []
agent_eligible: false
size: L
---

# FEAT-0592 — Populate a shared closed-bar cache from one venue socket per exchange

## Problem

Every client fetches the same historical bars from the same exchanges and pays
for them again on every cold start. `ANALYST_HISTORY_TARGET = 600`
(`src/services/marketAnalyst.ts:53`) against a silent 200-row Bitunix cap
(`BITUNIX_MAX_ROWS_PER_REQUEST`, `src/services/api/marketData.ts`) means three
pages per symbol and timeframe; four favourites across four timeframes is
roughly 48 requests per dashboard open. ADR-0009 records what that produced:
BUG-0230, BUG-0231 and BUG-0234, all of them silent.

Nobody serves that data. SpacetimeDB already holds Global Chat and is reachable
from the settings tab; ADR-0004 section 2 admits public market data as Class C
provided no user identity can be joined to a row. ADR-0022 decides how.

## Proposal

One ingestor per venue, driven by the existing WebSocket adapters, that
aggregates the tick stream into bars in memory and writes confirmed closes into
SpacetimeDB. Clients never write (ADR-0022 §1–§3).

**Socket, not polling.** `new RateLimiter(5, 1)` for Bitunix and
`new RateLimiter(20)` for Bitget (`src/services/api/requestManager.ts:66-68`)
mean 1s HTTP polling of a 300-symbol, 6-timeframe universe is 1800 req/s
against a 5 req/s limit — 360x over, arithmetically unavailable. Aggregation
over one socket per venue costs two connections total regardless of symbol
count. FEAT-0227 (adapter owns its socket) is `done`, so the ingestor attaches
to `src/services/exchange/` and does not open its own connections.

**Write rule (ADR-0022 §1, §2).** A bar is written only when
`openTime < currentBar.openTime`. Key is `symbol:tf:openTime`. If the key
exists and the venue returns a different value: do not overwrite — increment
`revision`, keep the original, log the divergence. Every bar carries `source`,
`fetched_at`, `revision`.

**Curated universe (ADR-0022 §3).** A configured list of `symbol:tf` pairs, no
default, no discovery, no client-triggered ingest. An unlisted symbol is served
by the fail-open path in FEAT-0594.

**Retention.** 2000 bars per `symbol:tf`, enforced by row cap rather than by
age. 300 symbols x 6 timeframes x 2000 bars is ~600k rows, provisionally ~90 MB
in memory. Time-based retention at 1m would produce 1.3M rows per day.

**Rebuild on boot.** A restart loses nothing: the module refetches its window
from the venue through the existing page walk.

## Acceptance criteria

- [ ] Exactly one WebSocket connection per venue, owned by the existing
      exchange adapters, not by the ingestor. A test that counts connections
      for N symbols asserts a constant.
- [ ] Bars are aggregated in memory and written only when the next bar has
      opened. A bar whose `openTime` equals the current bar's is never
      persisted.
- [ ] Key is `symbol:tf:openTime`; inserting the same key twice does not
      create a second row.
- [ ] A divergence on an existing key increments `revision`, retains the
      original values, and emits a log line naming the symbol, timeframe and
      both values. Covered by a test that seeds a stored bar, feeds a
      different venue value, and asserts the stored row is unchanged.
- [ ] Every stored bar carries `source`, `fetched_at` and `revision`.
- [ ] OHLCV rows are validated before insert (`high >= low`, `volume >= 0`,
      `open_time` aligned to the timeframe, positive prices).
- [ ] The symbol list is operator configuration with no default, no discovery
      mechanism and no pre-filled value. A test asserts the empty
      configuration ingests nothing.
- [ ] No client request path can trigger an ingest. A test drives the
      documented client entry points and asserts no ingest begins.
- [ ] Retention caps each `symbol:tf` at 2000 bars, oldest evicted first.
- [ ] The module rebuilds its window from the venue on boot and reaches the
      full configured depth without a manual step.
- [ ] No API key, token or credential is used. Only public market endpoints.
- [ ] The generated bindings in `src/lib/spacetimedb/` are produced by the
      generator, never hand-edited.
- [ ] Module RAM and row count at full configuration are measured and recorded.

## Out of scope

- Live or forming bars. They are never cached (ADR-0022 §1).
- Any client write path, including write-through from the first fetch.
- On-demand or per-user ingest.
- Funding rates, order books, tickers, liquidation feeds.
- A deep archive beyond 2000 bars per `symbol:tf`.
- High availability. A single ingestor with boot rebuild is the design; failover
  needs its own item.
- Subscription and push wiring on the client side (FEAT-0594).
- Metrics and dashboards. FEAT-0594 owns the counters.

## Open questions

- **Per-timeframe window depth.** 2000 bars at 200 rows per page is 10 pages
  and fits `MAX_KLINE_PAGES = 20` for 1m/5m/15m. A 12m timeframe needs 36
  pages and hits the cap. Resolution: either the window is shallower for
  synthetic timeframes, or the rebuild walks a coarser base. Decide before
  implementation; it changes the depth constant.
- **Subscription cost at target concurrency.** Unmeasured. FEAT-0594's load
  test is the gate; if it fails, the ADR's CDN alternative is the fallback.

## Links

- `docs/adr/0022-shared-hot-window-kline-cache.md` — the decision this
  implements. Must be `Accepted` before this item is `ready`.
- `docs/adr/0004-spacetimedb-data-scope.md` — Class C, the no-user-identity
  condition, and the localhost amendment.
- `docs/adr/0009-candle-depth-and-background-store-isolation.md` — the 200-row
  cap, the paging rule, and the `unknown`-not-a-value requirement.
- `docs/adr/0003-edition-boundary.md` — why this is a module and not core.
- `src/services/api/marketData.ts` — `BITUNIX_MAX_ROWS_PER_REQUEST`,
  `MAX_KLINE_PAGES`, the existing page walk to reuse.
- `src/services/api/requestManager.ts:60,66-68` — concurrency and the venue
  rate limiters that rule out polling.
- `src/services/marketAnalyst.ts:53` — `ANALYST_HISTORY_TARGET` and why it is
  600.
- `server/spacetimedb/src/index.ts`, `server/spacetimedb/src/rateLimit.ts` —
  existing module structure, retention sweep pattern, `sender_activity` rate
  limiter to reuse for any write throttling.
- `server/.cursor/rules/spacetimedb-typescript.mdc` — binding generation rules.
- `docs/backlog/features/FEAT-0227-adapter-owns-its-socket.md` — done; the
  ingestor must attach here rather than open its own socket.
- [FEAT-0591](features/FEAT-0591-http-cache-for-closed-bars.md) — HTTP-layer cache; the measurement
  that justifies or cancels this item.
- [`FEAT-0594`](features/FEAT-0594-read-closed-bars-from-the-shared-cache.md) — the client read path and load test.
