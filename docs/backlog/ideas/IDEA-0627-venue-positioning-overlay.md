---
id: IDEA-0627
title: Overlay venue positioning aggregates on the chart
type: idea
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: charts
data_class: C
adr: none
depends_on: []
---

# IDEA-0627 — Overlay venue positioning aggregates on the chart

## Problem

"Where is the market positioned?" has no answer on the chart today. The
trader sees price and local indicators, but not whether a move is carried
by fresh positioning or running on empty — information the venues publish
freely.

## Proposal

Display venue-published aggregates as a chart overlay, cached through the
existing proxy routes and computed nowhere near user data:

- Open Interest as a histogram under price (rising OI with rising price:
  trend with substance; rising price on falling OI: short covering only).
- Long/Short ratio as a line with extreme zones (a crowded long boat is a
  classic contrarian signal).
- Funding rate as candle tinting or a badge (high positive funding: longs
  pay up — an over-leveraged market).

No SpacetimeDB, no server module, no ADR: this is public Class C data
rendered locally, so it ships in all editions including Community. It is
also the honest version of "market positioning": the whole venue book,
not a handful of self-reported users — larger sample, no privacy question,
nothing to forge since the numbers come from the exchange.

## Out of scope

- Positioning derived from Cachy users in any form. Deliberately not
  proposed.
- Any new server state or per-user logging for this display.
- Trading signals derived from the aggregates: they may inform or veto
  (IDEA-0305), never trigger.

## Open questions

- Which venue endpoints cover OI and LS-ratio on both Bitunix and Bitget,
  and at what granularity?
- Overlay versus separate pane: does tinting obscure price action?
- Refresh cadence: funding ticks slowly, OI faster — one loop or two?

## Links

- docs/adr/0004-spacetimedb-data-scope.md §2
- docs/backlog/ideas/IDEA-0305-external-market-context-as-veto.md
- src/routes/api/ — funding-rate, position-tiers proxy routes
