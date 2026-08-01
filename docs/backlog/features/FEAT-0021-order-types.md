---
id: FEAT-0021
title: Support market, limit, trigger and fixed-risk orders with TP/SL attached
type: feature
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0011, FEAT-0017]
---

# FEAT-0021 — Support market, limit, trigger and fixed-risk orders with TP/SL attached

## Problem

Cachy calculates a position precisely and then offers a narrow way to place it.
A trader who wants a limit entry with a stop and two targets attached has to
assemble it at the exchange, which discards the precision the calculator
provided.

## Proposal

The full entry set, each sized by the existing calculator:

- **Market** — immediate, with slippage awareness
- **Limit** — resting, post-only where supported
- **Trigger / conditional** — activates at a price, then places market or limit
- **Fixed-risk** — the calculator's native mode: name the risk, the size follows

TP and SL attached at entry where the exchange supports it, otherwise placed as
follow-up orders with the dependency made explicit — a stop that silently failed
to attach is the most dangerous outcome in this item and must be surfaced
loudly, not logged.

Multi-target take-profit maps onto the existing multi-target calculator rather
than reimplementing it.

## Acceptance criteria

- [ ] Each order type places correctly on each supported exchange, verified live
- [ ] TP/SL attach at entry where supported; where not, the follow-up placement
      is confirmed and a failure is surfaced prominently
- [ ] Sizes and prices come from the calculator, computed with `Decimal`, and
      match what the UI displayed
- [ ] Every path passes the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) gate
- [ ] Unsupported types are absent per [`FEAT-0017`](FEAT-0017-exchange-capability-model.md)
- [ ] A partially placed order group (entry filled, stop rejected) is detected
      and reported, with a test
- [ ] German and English strings

## Open questions

- **Rollback semantics.** If the entry fills and the stop is rejected, the
  position exists unprotected. Retry, alert, or auto-close? This needs deciding
  before the item is `ready` — it is the single most consequential question here.

## Links

- Reference screenshots: Bitunix order panel — Limit / Fixed Risk, By Cost, trigger orders
- `src/lib/calculator.ts`, `src/services/tradeService.ts`
