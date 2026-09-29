---
id: FEAT-0591
title: Serve confirmed-closed bar ranges from an HTTP cache
type: feature
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: market-data
data_class: C
adr: none
depends_on: []
agent_eligible: true
size: XS
---

# FEAT-0591 — Serve confirmed-closed bar ranges from an HTTP cache

## Problem

A closed bar never changes. Every client nonetheless refetches the whole range
on a cold start, and `BITUNIX_MAX_ROWS_PER_REQUEST = 200` means 600 bars for
EMA 200 costs three sequential pages
(`src/services/marketAnalyst.ts:53`, `src/services/api/marketData.ts`).

ADR-0022 decides a shared cache belongs in SpacetimeDB. That is the larger
build. This item is the same latency win at the HTTP layer, with no server, no
new table and no new dependency — and it produces the measurement that says
whether FEAT-0592 is worth its cost.

## Proposal

Mark a kline response immutable when the range it delivers is entirely
confirmed-closed, and serve a matching repeat request from the HTTP cache.

The boundary is per bar, not per response: a range that overlaps the current
forming bar is not cacheable in full, so it either gets a short TTL or no
header. Truncation stays as loud as ADR-0009 requires — a capped fetch still
logs what it delivered.

## Acceptance criteria

- [ ] A response whose every bar satisfies `openTime < currentBar.openTime`
      carries an immutable cache directive with an explicit max-age.
- [ ] A response containing the forming bar does not carry that directive.
- [ ] A repeat request for a cached range issues zero venue requests, proven by
      a test that counts venue calls across two identical requests.
- [ ] A test proves a deliberately corrupted cached bar is served and detected,
      so a passing cache test cannot be an assertion about nothing.
- [ ] The cap-binding log from ADR-0009 is unchanged: a truncated fetch still
      names the candle count it delivered.
- [ ] No bar in a cached response is a forming bar, including at a timeframe
      boundary.

## Out of scope

- SpacetimeDB, the ingestor, or any new table. That is FEAT-0592.
- Live or forming prices. Never cached (ADR-0022 §1).
- Caching tickers, funding rates or account data.
- Extending `RequestManager`'s in-memory TTL.
- Changing the page walk or the 200-row cap.

## Open questions

None. The immutability boundary is decided by ADR-0022 §1.

## Links

- `docs/adr/0022-shared-hot-window-kline-cache.md` §1 — the confirmed-close
  rule this applies at the HTTP layer.
- `docs/adr/0009-candle-depth-and-background-store-isolation.md` — the paging
  rule and the logging requirement that must survive.
- `src/services/api/marketData.ts` — `fetchBitunixKlines`, the page walk, and
  `MAX_KLINE_PAGES`.
- `src/services/api/requestManager.ts:111-202` — where the 10s in-memory cache
  sits and where a request count would be observed.
- `src/tests/performance/startup_benchmark.test.ts` — reports `Kline Requests`
  and `Total HTTP Requests`; this item is the baseline it is measured against.
- `docs/backlog/features/FEAT-0592-server-side-kline-ingestor.md` — the item
  this one measures.
