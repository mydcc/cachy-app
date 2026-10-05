---
id: IDEA-0626
title: Seed cold start from a shared Class-C market data cache
type: idea
status: idea
priority: P3
milestone: M8
editions: [pro, private]
area: cloud
data_class: C
adr: required
depends_on: [FEAT-0014]
---

# IDEA-0626 — Seed cold start from a shared Class-C market data cache

## Problem

A cold dashboard pays the full fetch cost every time: ~48 requests across
four favourites times four timeframes against the Bitunix 200-row cap, plus
paging walks for the 600 candles an EMA-200 needs (ADR-0009). The technicals
panel fills in tens of seconds, and long-look-back indicators start as
`"unknown"`.

## Proposal

Cache public market data and derived analysis — klines, news, sentiment —
once for everyone on a shared instance (Class C per ADR-0004 §2, no opt-in:
it is not personal data). New clients seed from it instead of fetching the
full history themselves:

- Blind publish: the server publishes a fixed top-N symbol set; clients
  subscribe to everything published and filter locally. No per-user request
  log, no sender or connection identity anywhere near a Class C row —
  otherwise it is not Class C.
- One-shot seed, not a live subscription for everything: the client hydrates
  from the cache, then resumes its normal local fetch/compute path. Local
  WASM/Worker/WebGPU computation stays authoritative and offline-capable.
- Live tick only for a few majors at most.

This is also M8's data foundation (ADR-0004 §4): the analyst needs market
data cached and processed somewhere that is not the user's device.

## Out of scope

- Full indicator history for all symbols and timeframes mirrored live:
  in-memory mirrored state plus commit log plus exchange polling is the
  analytics workload SpacetimeDB is not built for, and push buys nothing on
  candle-close cadence.
- Any user identity, watchlist signal or per-user access log on the cache.
- Replacing local indicator computation (ADR-0003 core boundary).
- Turning the seed into a dependency: core works with the server unreachable.

## Open questions

- Spike: can the Rust indicator/rule code run inside a SpacetimeDB reducer,
  or does the cache hold raw klines only and clients compute?
- Who pays the venue polling on the Cachy-operated instance (rate limits,
  costs)?
- Top-N set: fixed list or slowly rotating? Who decides?

## Links

- docs/adr/0004-spacetimedb-data-scope.md §2, §4
- docs/adr/0003-edition-boundary.md
- docs/adr/0009-candle-depth-and-background-store-isolation.md
- docs/backlog/features/FEAT-0014-edition-build-targets.md
