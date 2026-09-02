---
id: FEAT-0335
title: Trail a stop behind a position once the exchange endpoint is verified
type: feature
status: specced
priority: P2
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0017]
parent: FEAT-0023
---

# FEAT-0335 — Trail a stop behind a position once the exchange endpoint is verified

> **Blocked, and not by a decision.** There is no verified Bitunix trailing-stop
> endpoint in the current API doc crawl — see
> [`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) §Trade and
> [`FEAT-0070`](FEAT-0070-bitunix-tpsl-placement.md)'s own Out of scope. Nothing
> here can be built, and nothing here should be estimated, until the endpoint is
> confirmed against the live API. That is why this item carries no `estimate`
> and no `size`: both would be invented numbers.

## Problem

A stop that does not follow a winning position either gets left behind, giving
back the move, or gets dragged by hand, which means watching the chart — the
thing Cachy exists to stop a trader having to do. Every venue Cachy talks to
offers some form of trailing stop; Cachy offers none.

## Proposal

A trailing stop on an open position: a trail distance, expressed as a
percentage or an absolute offset, that moves the stop in the position's
favour and never against it.

The shape of the feature is not the hard part. The hard part is that a trailing
stop is a **standing instruction held by someone**, and who holds it changes
everything:

- **Exchange-side** — the venue owns the trail. It keeps working when Cachy is
  closed, which is the only version worth shipping for a stop. It requires the
  endpoint that does not yet exist.
- **Client-side** — Cachy watches the price and moves the stop itself. It stops
  working the moment the tab closes, the laptop sleeps or the WebSocket drops,
  and a stop that silently stops trailing is worse than no trailing stop,
  because the trader believes it is there.

**This item is the exchange-side version.** A client-side emulation is not a
fallback for it and must not be introduced as one; if it is ever wanted, it is
a different item with its own honest name and its own warning copy.

## Acceptance criteria

- [ ] A trailing-stop endpoint is documented in the API crawl and verified
      against the live venue, per exchange — this criterion gates every one
      below it
- [ ] A trail distance can be set on an open position, as a percentage or an
      absolute offset, in `decimal.js`
- [ ] The instruction is placed at the exchange and survives Cachy being closed
- [ ] The trail moves only in the position's favour, with a test
- [ ] The action passes the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
      gate like every other order
- [ ] The control is **absent**, not disabled-with-an-error, on any exchange
      whose capability model does not report support, per
      [`FEAT-0017`](FEAT-0017-exchange-capability-model.md)
- [ ] German and English strings

## Out of scope

- **Client-side trailing.** See above — it is a different item, not this one
  degraded.
- **Trailing take-profit.** Same endpoint question, different instruction;
  split it out once the API is known rather than assuming they arrive together.

## Open questions

- **Which venues actually support it, and with which parameter shape?**
  Unanswerable until the crawl is redone. The answer decides whether this is one
  item or one per exchange.

## Links

- [`FEAT-0023`](FEAT-0023-position-management.md) — the epic this belongs to
- [`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) — §Trade, where the endpoint is not
- [`FEAT-0070`](FEAT-0070-bitunix-tpsl-placement.md) — TP/SL placement, excludes trailing
- [`FEAT-0017`](FEAT-0017-exchange-capability-model.md) — capability model
- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the gate every action passes
