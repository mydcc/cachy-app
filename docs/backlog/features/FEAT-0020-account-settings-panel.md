---
id: FEAT-0020
title: Show and change exchange account settings from Cachy
type: feature
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: [FEAT-0017]
---

# FEAT-0020 — Show and change exchange account settings from Cachy

## Problem

Margin mode, position mode, asset mode and per-symbol leverage live at the
exchange and are invisible in Cachy. A user has to open the exchange's own UI to
check or change them — and worse, Cachy sizes positions without knowing them,
so a position calculated for isolated margin can be placed into a cross-margin
account with a completely different liquidation profile.

## Proposal

A panel that reads the account's real configuration from the exchange and lets
the user change it:

- **Margin mode:** isolated / cross, per symbol and account-wide
- **Position mode:** one-way / hedge
- **Asset mode:** single-asset / multi-asset
- **Leverage:** per symbol, within the exchange's bounds
- **Default TP/SL behaviour** where the exchange exposes it

Everything reflects the exchange's actual state, refreshed rather than cached
optimistically. Availability comes from
[`FEAT-0017`](FEAT-0017-exchange-capability-model.md) — an exchange without
hedge mode does not show the control.

Changes to these settings are order-adjacent: switching margin mode with an open
position changes its liquidation price. Every change goes through a confirmation
that states the consequence, and the
[`FEAT-0011`](FEAT-0011-preflight-order-verification.md) gate reads the real
values rather than the displayed ones.

## Acceptance criteria

- [ ] Each setting reflects the exchange's real state, verified against the
      exchange's own UI
- [ ] Changing each setting takes effect at the exchange, per exchange
- [ ] Controls for unsupported capabilities are absent, not broken
- [ ] Changing a setting with an open position warns with the specific
      consequence
- [ ] The verification gate reads live account state, not the panel's cache
- [ ] Failure to read the state blocks order placement rather than assuming
      defaults
- [ ] German and English strings

## Out of scope

Cachy's own risk limits — those are [`FEAT-0013`](FEAT-0013-risk-limits-and-kill-switch.md)
and are enforced locally regardless of exchange settings.

## Links

- Reference screenshots: Bitunix "Configs" panel — Margin Mode, Contract Unit,
  Asset Mode, Position Mode
- [`FEAT-0017`](FEAT-0017-exchange-capability-model.md)
