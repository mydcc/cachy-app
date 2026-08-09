---
id: IDEA-0074
title: Surface funding-rate history for a symbol
type: idea
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: exchange
data_class: C
adr: none
depends_on: []
---

# IDEA-0074 — Surface funding-rate history for a symbol

## The thought

`GET /api/v1/futures/market/get_funding_rate_history` (public, up to 200
entries — see [`04_market.md`](../../bitunix-api/04_market.md)) is unused.
Historical funding matters to anyone holding perp positions across settlement:
a small chart or average-funding figure next to the current rate would show
whether a symbol is chronically expensive to hold long or short, and the
journal could attribute realised funding cost per trade more precisely.

## What would have to be true first

- A concrete UI home: market details window or journal analytics — decided as
  part of the M3/M4 UI work, not bolted on.

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) §1
