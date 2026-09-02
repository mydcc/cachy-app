---
id: FEAT-0332
title: Show and change the account's asset mode
type: feature
status: specced
priority: P2
milestone: M4
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: [FEAT-0017, FEAT-0020]
estimate: 3
size: M
target_date: 2027-03-31
start_date: 2026-09-02
---

# FEAT-0332 — Show and change the account's asset mode

## Problem

Asset mode — single-asset or multi-asset margin — decides which balances back a
position. In multi-asset mode the whole portfolio backs the margin; in
single-asset only the position's own coin does. The two produce different
liquidation prices for identical positions.

Cachy neither shows it nor knows it. It was listed in
[`FEAT-0020`](FEAT-0020-account-settings-panel.md)'s proposal alongside margin
mode, position mode and leverage, and split out when that item shipped: the
other three existed in some form, and asset mode has nothing behind it at all.

## Proposal

The same shape the other three settings already have in
`ExchangeAccountControls.svelte`: read the venue's real value, show it, let it
be changed, gate the control on
[`FEAT-0017`](FEAT-0017-exchange-capability-model.md), confirm through
[`FEAT-0024`](FEAT-0024-confirmation-policy.md)'s policy.

Nothing of that exists yet for this setting — a search of `src/` for
`assetMode` returns no capability flag, no schema, no route, no adapter verb,
no store field, no string.

## Before this can be specced properly

**Which venues support it, and under what name.** Bitunix's Configs panel
exposes it; whether Bitget does, and whether either allows changing it through
the API rather than only reading it, is unresearched. `docs/bitunix-api/` is the
place to confirm the first half, and
[`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) the place to
record it — the same gap that keeps trailing stops blocked in
[`FEAT-0023`](FEAT-0023-position-management.md).

**Whether the preconditions match the others.** Margin mode is blocked on a busy
symbol and position mode on any open position, both because the venue refuses
the change. Asset mode plausibly has its own rule, and guessing it produces a
control that fails at the exchange instead of in the UI.

## Acceptance criteria

- [ ] The account's real asset mode is shown, refreshed rather than cached
- [ ] It can be changed where the venue allows it
- [ ] The control is absent on a venue that does not support it, not broken
- [ ] Its precondition matches the venue's own rule, blocking rather than
      failing at the exchange
- [ ] Changing it goes through the confirmation policy
- [ ] German and English strings

## Out of scope

Recalculating open positions' liquidation prices for the new mode. That is worth
having and is a calculator concern, not a settings-panel one.

## Links

- [`FEAT-0020`](FEAT-0020-account-settings-panel.md) — the panel this joins
- [`FEAT-0017`](FEAT-0017-exchange-capability-model.md) — capability gating
- [`FEAT-0024`](FEAT-0024-confirmation-policy.md) — the confirmation policy
