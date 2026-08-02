---
id: FEAT-0013
title: Enforce hard risk limits and a kill switch at the execution boundary
type: feature
status: specced
priority: P0
milestone: M1
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# FEAT-0013 — Enforce hard risk limits and a kill switch at the execution boundary

## Problem

Nothing stops a sequence of individually plausible orders from adding up to a
loss the user never intended, and there is no single action that stops all
outgoing order traffic. Risk today is a number in a form, enforced by the user's
attention.

## Proposal

**Limits**, configured once and enforced where orders leave, not where they are
entered:

- max position size (absolute and as a share of account equity)
- max leverage
- max loss per trade
- max loss per day, measured against realised PnL
- max concurrent open positions

**A kill switch**: one action that blocks every outgoing order immediately,
survives a reload, and requires a deliberate action to clear. It blocks new
orders and modifications; it does **not** close positions — an automatic
liquidation triggered by a panic button is a way to turn a scare into a loss.

Limits and the switch are checked inside the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
gate, so nothing can route around them.

Both are Class A: limits are settings, the daily-loss figure derives from the
journal. Neither leaves the device.

## Acceptance criteria

- [ ] Each limit has a test that submits an order exceeding it and asserts
      refusal with the limit named
- [ ] Limits are enforced at the gate, not in the form — proven by a test that
      constructs an over-limit order programmatically
- [ ] The kill switch blocks a live submission attempt, asserted with no
      outbound request
- [ ] The switch survives reload
- [ ] Clearing it requires an explicit confirmation
- [ ] The daily-loss counter is computed with `Decimal` and resets on a defined
      boundary stated in this item
- [ ] Limit and switch state never leave the device
- [ ] German and English strings

## Out of scope

- Automatic position closing on breach. Deliberate — see above.
- Exchange-side risk settings. Those are [`FEAT-0020`](FEAT-0020-account-settings-panel.md).

## Open questions

- **Which timezone does "per day" use?** Exchange UTC day, or the user's local
  day? They differ and the difference is money.
- **Does the daily limit count paper trades?** It must not, and that has to be
  explicit rather than incidental.
- **Trailing-stop and TP/SL modifications** — blocked by the kill switch or
  allowed? Blocking a stop-loss adjustment during a panic could be worse than
  allowing it.

## Links

- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the gate that calls this
- `src/services/rmsService.ts` — existing risk-management service
