---
id: FEAT-0074
title: Surface funding-rate history for a symbol
type: feature
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: exchange
data_class: C
adr: none
depends_on: []
estimate: 5
size: L
target_date: 2026-11-22
---

# FEAT-0074 — Surface funding-rate history for a symbol

## The Problem / Feature

Historical funding matters to anyone holding perp positions across settlement: a small chart or average-funding figure next to the current rate shows whether a symbol is chronically expensive to hold long or short. Currently, the public Bitunix endpoint `GET /api/v1/futures/market/get_funding_rate_history` is unused. 

We need to fetch the last 7 days (21 entries at 8h intervals) on demand and display it:
1. **Header/MarketOverview Popover:** A hover/click popover over the current funding rate showing a mini sparkline chart and the 7-day average.
2. **Calculator Estimate:** An info line in the position size calculator (`TradeSetupInputs.svelte`) that estimates the 24h holding cost in quote currency for the entered position size.

## Acceptance criteria

- `src/services/bitunixApi.ts` (or equivalent exchange service) implements `GET /api/v1/futures/market/get_funding_rate_history`.
- When clicking or hovering the Funding Rate in `MarketOverview.svelte` or the header, a Svelte 5 component (`FundingRatePopover.svelte`) opens.
- The Popover displays a visual sparkline/mini-chart of the funding rate history and calculates the 7-day average funding rate accurately using `decimal.js`.
- In `TradeSetupInputs.svelte`, when a position size and entry price are present, an estimated 24h holding cost (using the 7D average funding rate) is displayed.
- The holding cost calculation strictly uses `decimal.js` for all math.
- The history data is only fetched once on demand (cached), avoiding spamming the public API on every re-render.

## Out of scope

- Retroactively modifying the Trade Journal or past closed trades to calculate their exact historical funding cost (this remains for a separate journal-focused item).
- Supporting multiple exchanges (only Bitunix API is required).
- Real-time WebSocket streaming for the history (on-demand REST fetch is sufficient).
- Elaborate interactive charting library for the popover (a simple CSS-based or SVG sparkline is preferred).

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) §1
- [`04_market.md`](../../bitunix-api/04_market.md)
