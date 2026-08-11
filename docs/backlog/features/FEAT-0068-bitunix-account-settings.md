---
id: FEAT-0068
title: Read and change leverage, margin mode and position margin from the trade panel
type: feature
status: in-progress
priority: P1
milestone: M3
editions: [community, pro, private]
area: exchange
data_class: A
adr: none
depends_on: []
---

Branch: `feat/bitunix-readonly-data-display`

# FEAT-0068 — Read and change leverage, margin mode and position margin from the trade panel

**Progress note (this branch):** the read side is done — `get_leverage_margin_mode`
is fetched per symbol and shown in `GeneralInputs.svelte` (leverage sync
indicator + a margin-mode badge). The four `change_*`/`adjust_*` write actions
below stay open for the execution milestone.

## Problem

The Bitunix API can read and change leverage, margin mode (ISOLATION/CROSS),
position mode (ONE_WAY/HEDGE) and isolated-position margin — see
[`02_account.md`](../../bitunix-api/02_account.md). Cachy integrates none of
it: the trade panel neither shows the active leverage/margin mode for a symbol
nor lets the user change it, so every settings change requires the exchange's
own UI. M3 lists "account state, displayed and editable" as a milestone bullet.

## Proposal

One proxy route for the account-settings endpoint family:

- `GET get_leverage_margin_mode` — display current leverage + margin mode per
  symbol in the trade panel.
- `POST change_leverage`, `POST change_margin_mode`,
  `POST change_position_mode`, `POST adjust_position_margin` — write actions,
  each surfaced in the panel with the API's own preconditions reflected in the
  UI (margin mode only without open position/order on the symbol; position
  mode only without any open positions; margin adjust only for isolated).

Write actions follow the existing signed-proxy pattern and confirm success via
the private WebSocket state rather than trusting the REST response alone.

## Acceptance criteria

- [x] The trade panel shows current leverage and margin mode for the active
      symbol, fetched from the API rather than assumed.
- [ ] Leverage can be changed within the pair's `minLeverage`/`maxLeverage`
      range; values outside are rejected client-side.
- [ ] Margin-mode and position-mode controls are disabled — with a reason —
      when the API precondition (open positions/orders) is not met.
- [ ] Isolated-position margin can be increased and reduced; the position's
      updated margin is reflected via WS/refetch, not optimistic-only.
- [ ] API keys are used only as credentials of the user-initiated request
      through the proxy (ADR-0001 exception); nothing else leaves the device.

## Out of scope

- Asset mode (single/multi-asset) — no Bitunix endpoint in the current doc
  crawl.
- Bitget equivalents (follow the M2 adapter shape when it exists).

## Open questions

- Should changing leverage while a position is open be gated behind an extra
  confirmation, given it changes liquidation distance immediately?

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
- [`docs/bitunix-api/02_account.md`](../../bitunix-api/02_account.md)
- [`docs/MILESTONES.md`](../../MILESTONES.md) — M3
