---
id: IDEA-0075
title: Use Bitunix position tiers for precise liquidation and margin estimates
type: idea
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: calculation
data_class: C
adr: none
depends_on: []
---

# IDEA-0075 — Use Bitunix position tiers for precise liquidation and margin estimates

## The thought

`GET /api/v1/futures/position/get_position_tiers` (public — see
[`05_position.md`](../../bitunix-api/05_position.md)) returns the maintenance
margin rate per position-size tier. Cachy's risk display currently relies on
the `liqPrice` the exchange reports for open positions; with the tier table
the calculator could estimate liquidation price and maintenance margin
**before** a position exists — at planning time, where Cachy's whole value
proposition lives — and show how a planned size change moves the position into
a worse tier.

## What would have to be true first

- Verify the tier formula against exchange-reported `liqPrice` for live
  positions before showing planning-time estimates; a wrong liquidation
  estimate is worse than none.

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) §1
