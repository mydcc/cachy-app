---
id: FEAT-0067
title: Fetch Bitunix trading-pair metadata and validate orders against it
type: feature
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: exchange
data_class: C
adr: none
depends_on: []
estimate: 3
size: M
target_date: 2026-11-20
---

Branch: `feat/bitunix-readonly-data-display`

# FEAT-0067 — Fetch Bitunix trading-pair metadata and validate orders against it

**Progress note (this branch):** the read side is done — metadata is fetched
per symbol into `marketState.symbolMeta` and shown in `TradeSetupInputs.svelte`
(precision, min size, leverage range, status). The validation/rounding
acceptance criteria below are execution-path work and stay open — there is no
order-submit action yet to enable or refuse.

## Problem

Cachy never calls `GET /api/v1/futures/market/trading_pairs`, so it does not
know a symbol's price/quantity precision, minimum trade volume, maximum order
volumes, leverage range, `priceProtectScope`, `symbolStatus` or
`isApiSupported`. Every order the trade panel will place needs these to round
and validate its values; today any such check would be guesswork. The API doc
chapter is [`04_market.md`](../../bitunix-api/04_market.md), the gap is
recorded in
[`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) §1.

## Proposal

A proxy route (public endpoint, no key needed) plus a client-side instrument
store: fetch once per session, cache per symbol, expose precision and limits as
`Decimal`-safe values. Order construction and the M1 verification gate
([`FEAT-0011`](FEAT-0011-preflight-order-verification.md)) read from it; the UI
uses it to round inputs and to disable trading when `symbolStatus` is not
`OPEN` or `isApiSupported` is false.

## Acceptance criteria

- [ ] Trading-pair metadata for the active symbol is available in a store
      before the trade panel enables its submit action.
- [ ] Quantity and price inputs are rounded to `basePrecision` /
      `quotePrecision` using `decimal.js`, never native floats.
- [ ] An order below `minTradeVolume` or above the max order volume is refused
      client-side with a message naming the violated limit.
- [ ] A symbol with `symbolStatus != OPEN` or `isApiSupported == false` shows
      trading as unavailable instead of failing at submission.

## Out of scope

- Leverage range enforcement UI (belongs to
  [`FEAT-0068`](FEAT-0068-bitunix-account-settings.md)).
- The generic per-exchange capability model (M2); this item may start
  Bitunix-only and be folded into the adapter later.

## Open questions

- Cache lifetime: per session, or refreshed on a timer? Pair metadata changes
  rarely but `symbolStatus` can flip.

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
- [`docs/bitunix-api/04_market.md`](../../bitunix-api/04_market.md)
- [`docs/MILESTONES.md`](../../MILESTONES.md) — M3
