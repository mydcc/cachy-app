---
id: FEAT-0023
title: Manage open positions without leaving Cachy
type: feature
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [FEAT-0021]
---

# FEAT-0023 — Manage open positions without leaving Cachy

## Problem

Cachy can open a position and then has little to say about it. Adjusting a stop,
taking partial profit or closing quickly all happen at the exchange.

## Proposal

- **Flash close** — immediate market close, one action, behind a confirmation
  policy
- **Partial close** — by percentage or absolute size
- **Trailing stop** and **trailing TP/SL** where supported
- **Modify position TP/SL** after entry
- **Add to / reduce** an existing position, with the average entry recomputed
  and displayed before committing

Every action is an order and passes the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
gate. Flash close is the most dangerous control in the product — one click, full
size, market price — so its confirmation default is on and turning it off is a
deliberate act.

## Acceptance criteria

- [ ] Each action works on each supported exchange, verified live
- [ ] Recomputed average entry and resulting risk are shown before commit,
      computed with `Decimal`
- [ ] Partial close sizes respect the instrument's step size
- [ ] Flash close requires confirmation by default
- [ ] Unsupported actions are absent per capabilities
- [ ] Every action passes the verification gate
- [ ] German and English strings

## Links

- [`FEAT-0024`](FEAT-0024-confirmation-policy.md)
- `src/services/tradeService.ts` — existing flash-close tests
