---
id: FEAT-0075
title: Show maintenance-margin tier context next to an open position
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: calculation
data_class: C
adr: none
depends_on: []
estimate: 13
size: XL
target_date: 2026-11-21
---

# FEAT-0075 — Show maintenance-margin tier context next to an open position

Branch: `feat/bitunix-readonly-data-display`

## Problem

`GET /api/v1/futures/position/get_position_tiers` (public — see
[`05_position.md`](../../bitunix-api/05_position.md)) returns the maintenance
margin rate per position-size bracket. Cachy's position display shows the
exchange-reported `liquidationPrice`/`marginRate` but nothing about which
bracket a position currently sits in or how close it is to a worse one.

## Proposal

Fetch tiers per symbol (read-only, no key needed) and show, next to the
existing liquidation price in `PositionTooltip.svelte`: the current tier's
maintenance-margin rate and, if not already in the last tier, the notional
value at which the next (worse) tier begins.

## Acceptance criteria

- [x] Position tiers are fetched per active symbol and cached
      (`marketState.positionTiers`).
- [x] `PositionTooltip.svelte` shows the current tier's maintenance-margin
      rate next to `marginRate`/`liquidationPrice`.
- [x] `PositionTooltip.svelte` shows the notional value at which the next
      tier begins, when one exists.
- [ ] The tier lookup (notional value → bracket) is verified against a live
      position with a known `liqPrice`, not just against the documented
      response shape.

## Out of scope

- Estimating liquidation price or maintenance margin **before** a position
  exists (the original idea's planning-time use case) — this wave only
  displays tier context for positions that already exist. A calculator-side
  pre-trade estimate is a separate, larger item if pursued later.
- Bitget (or any other exchange) equivalent — Bitunix only, see
  [`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md).

## Open questions

- Whether the tier bracket is keyed by notional value (size × price, as
  implemented) or by margin — the docs call it "Positionsmengen-Stufe"
  without being fully explicit; needs the live-position verification above.

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) §1
- [`docs/bitunix-api/05_position.md`](../../bitunix-api/05_position.md)
