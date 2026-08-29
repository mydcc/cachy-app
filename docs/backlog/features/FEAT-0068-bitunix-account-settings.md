---
id: FEAT-0068
title: Read and change leverage, margin mode and position margin from the trade panel
type: feature
status: in-progress
priority: P1
milestone: M3
editions: [community, pro, private]
area: exchange
assignee: claude
branch: worktree-issue-1809-feb78b
data_class: A
adr: none
depends_on: []
estimate: 2
size: S
target_date: 2026-11-24
start_date: 2026-08-09
---


Branch: `feat/bitunix-readonly-data-display`

# FEAT-0068 — Read and change leverage, margin mode and position margin from the trade panel

**Progress note:** the read side shipped first — `get_leverage_margin_mode`
is fetched per symbol and shown in `GeneralInputs.svelte` (leverage sync
indicator + a margin-mode badge). The four `change_*`/`adjust_*` write actions
followed on `worktree-issue-1809-feb78b`: one proxy route
(`src/routes/api/account-settings/+server.ts`) resolving a venue module
(FEAT-0228), four verbs on the adapter's `AccountPort` behind a new
`supports.accountSettings` flag, and two UI surfaces —
`ExchangeAccountControls.svelte` in the trade panel (leverage, margin mode,
position mode) and `AdjustMarginModal.svelte` on isolated positions.

## Problem

The Bitunix API can read and change leverage, margin mode (ISOLATION/CROSS),
position mode (ONE_WAY/HEDGE) and isolated-position margin — see
[`02_account.md`](../../bitunix-api/02_account.md). Cachy integrates none of
it: the trade panel neither shows the active leverage/margin mode for a symbol
nor lets the user change it, so every settings change requires the exchange's
own UI. M3 lists "account state, displayed and editable" as a milestone bullet.

The same "account state, displayed" gap also applies to fields already
arriving over the private `wallet` WebSocket channel
(`docs/bitunix-api/08_websocket.md:191-213`): `expMoney`, `isolationFrozen`
and `crossFrozen` are received and stored on `Asset`
(`src/stores/account.svelte.ts`), but nothing in the UI reads them.

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

- Surface `expMoney`, `isolationFrozen` and `crossFrozen` from the existing
  `wallet` channel subscription somewhere in the account/balance UI (e.g.
  `AccountSummary.svelte` / `AccountTooltip`), next to the existing
  isolation/cross margin split. No new fetch — the data already flows.

## Acceptance criteria

- [x] The trade panel shows current leverage and margin mode for the active
      symbol, fetched from the API rather than assumed.
- [x] Leverage can be changed within the pair's `minLeverage`/`maxLeverage`
      range; values outside are rejected client-side.
- [x] Margin-mode and position-mode controls are disabled — with a reason —
      when the API precondition (open positions/orders) is not met.
- [x] Isolated-position margin can be increased and reduced; the position's
      updated margin is reflected via WS/refetch, not optimistic-only.
- [x] API keys are used only as credentials of the user-initiated request
      through the proxy (ADR-0001 exception); nothing else leaves the device.
- [x] `expMoney`, `isolationFrozen` and `crossFrozen` are visible in the
      account UI when non-zero, sourced from the existing `wallet` channel
      data rather than a new fetch. (Shipped ahead of this branch — the
      fields are read by `AccountSummary` and rendered in `AccountTooltip`.)

## Out of scope

- Asset mode (single/multi-asset) — no Bitunix endpoint in the current doc
  crawl.
- Bitget equivalents (follow the M2 adapter shape when it exists).

## Open questions

- ~~Should changing leverage while a position is open be gated behind an extra
  confirmation, given it changes liquidation distance immediately?~~ Yes, and
  only then. `ExchangeAccountControls` shows a confirmation naming the symbol
  and both leverage values when the symbol carries a position or resting
  order, and none when it does not — a dialog on every leverage change would
  train the trader to dismiss the one that matters.

## Notes

- The read stayed in `/api/leverage-margin-mode` rather than moving into the
  new route. The proposal above asks for "one proxy route for the
  account-settings endpoint family"; moving a working GET would have put the
  only shipping account read at risk for a symmetry that buys nothing. Both
  routes speak the same internal contract.
- Bitget is declared `accountSettings: false` and refuses these verbs in the
  adapter (FEAT-0229), with the venue module returning `null` as the
  server-side backstop. Its endpoints exist; a verified request format does
  not.

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
- [`docs/bitunix-api/02_account.md`](../../bitunix-api/02_account.md)
- [`docs/MILESTONES.md`](../../MILESTONES.md) — M3
