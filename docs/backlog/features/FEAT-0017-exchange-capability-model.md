---
id: FEAT-0017
title: Describe what each exchange can do, and let the UI read it
type: feature
status: specced
priority: P1
milestone: M2
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: [FEAT-0016]
---

# FEAT-0017 — Describe what each exchange can do, and let the UI read it

## Problem

Exchanges genuinely differ: hedge mode, multi-asset margin, trailing stops,
fixed-risk orders and conditional order types are not universal, and neither are
their parameter ranges. Without a capability model the UI either assumes the
lowest common denominator — losing features on the exchange that has them — or
assumes the richest and fails at submission, which is the worse failure because
it happens after the user committed.

## Proposal

Each adapter declares its capabilities: supported order types, margin modes,
position modes, asset modes, TP/SL attachment, trailing support, leverage
bounds, quantity and price step sizes.

The UI reads capabilities and hides or disables what the active exchange cannot
do, with a reason on hover rather than a silent absence. The
[`FEAT-0011`](FEAT-0011-preflight-order-verification.md) gate reads the same
declarations, so an unsupported combination is refused before transport even if
the UI is wrong.

## Acceptance criteria

- [ ] Capabilities are declared per adapter and consumed by the UI
- [ ] A control for an unsupported capability is not reachable, tested per
      exchange
- [ ] The verification gate refuses an unsupported combination independently of
      the UI
- [ ] Step sizes and leverage bounds come from capabilities, not constants
- [ ] Adding a capability to one adapter changes no other adapter

## Links

- [`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md)
- [`FEAT-0020`](FEAT-0020-account-settings-panel.md) — the main consumer
