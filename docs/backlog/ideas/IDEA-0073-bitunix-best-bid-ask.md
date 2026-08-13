---
id: IDEA-0073
title: Show best bid/ask and spread from the Bitunix tickers batch channel
type: idea
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: C
adr: none
depends_on: []
estimate: 8
size: L
target_date: 2026-11-26
---

# IDEA-0073 — Show best bid/ask and spread from the Bitunix tickers batch channel

## The thought

The public `tickers` batch channel carries best bid/ask price and volume
(`bd`/`ak`/`bv`/`av`) that the currently used single-`ticker` channel does not
(see [`08_websocket.md`](../../bitunix-api/08_websocket.md)). A trade panel
could show spread and a realistic market-order fill estimate without the
heavier `depth_book5` subscription, and the market overview could get best
bid/ask for many symbols from one stream.

## What would have to be true first

- The trade panel redesign (M3) decides whether spread display earns its
  screen space — data availability alone is not a reason to show it.

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) §2
