---
id: FEAT-0057
title: Show the full Bitunix position/order dataset in the Market Activity panel
type: feature
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
---

# FEAT-0057 — Show the full Bitunix position/order dataset in the Market Activity panel

## Problem

The Market Activity panel (`PositionsSidebar.svelte` and its Positions/
Orders/History sub-views) renders noticeably less than what Bitunix's own
API — and Bitunix's own trade panel — actually exposes. A trader comparing
the two side by side sees fields missing entirely (margin rate, realized PnL
on an open position, a live mark price), fields that render but are
structurally wrong (`markPrice` always `0`, see
[`BUG-0055`](../bugs/BUG-0055-position-mark-price-always-zero.md)), and a
history view that goes stale (see
[`BUG-0056`](../bugs/BUG-0056-order-history-tab-stale.md)). The user needs to
see position state "at a glance" and currently cannot.

## Proposal

Data-accurate rebuild of the read side of the panel — no new trading actions
(those are [`FEAT-0023`](FEAT-0023-position-management.md)'s scope), only
surfacing data the API already returns.

1. ~~**Mark-price pipeline**~~ — done, see `BUG-0055`'s Fix section.
2. **Positions card**: add the fields Bitunix's `Get Pending Positions`
   already returns but the client never maps — `marginRate`
   and `realizedPNL` (`docs/bitunix-api/05_position.md:103-129`) — into
   `NormalizedPosition`, `/api/positions`, and the `Position` store type.
   Show them alongside existing Entry/Liq. Price/Margin/PnL. Add a
   Quote-equivalent size (`qty × markPrice`, client-computed, no new call).
   Cross-reference `accountState.openOrders` for TP/SL prices set on the
   symbol and show them inline on the card (data already fetched for the
   TP/SL tab, just not mirrored here).
3. **History**: show the `reduceOnly` field (already in `NormalizedOrder`,
   never rendered). A time-range filter and pagination beyond the server's
   hard-coded last-20-per-bucket limit (`src/routes/api/orders/+server.ts:452`)
   is real but large enough to need its own spec — tracked here as an open
   question, not committed to in this item.
4. **Account summary**: add a "Total Position Size" line (`Σ qty × markPrice`
   across open positions, client-computed) alongside the existing
   Equity/Wallet Balance/Margin figures, matching Bitunix's Assets panel.

## Acceptance criteria

- [x] Mark price on an open position updates live and never renders as `0`
      or a stale value (see `BUG-0055`'s acceptance criteria)
- [ ] Margin rate and realized PnL are visible on an open position's card
- [ ] A position's active TP/SL (if set) is visible on the card itself, not
      only in the separate TP/SL tab
- [ ] History shows `reduceOnly` per order
- [ ] Account summary shows total open position size
- [ ] German and English strings for every new label
- [ ] `npm run check` and the affected Vitest suites pass

## Out of scope

- New trading actions (Reverse, Add/Reduce Margin, Partial Close, editing
  Trailing TP/SL) — these are `FEAT-0023`.
- Server-side history time-range filtering/pagination — real gap, needs its
  own spec (see `BUG-0056`'s "Out of scope").

## Open questions

- Should the history time-range filter ship as part of this item or as its
  own follow-up `FEAT`? Leaning follow-up given the server-side work
  involved (new `startTime`/`endTime` params, UI for the range picker).

## Links

- [`BUG-0055`](../bugs/BUG-0055-position-mark-price-always-zero.md)
- [`BUG-0056`](../bugs/BUG-0056-order-history-tab-stale.md)
- [`FEAT-0023`](FEAT-0023-position-management.md) — action side, not display
- `docs/bitunix-api/05_position.md`, `04_market.md`, `08_websocket.md`
- `src/components/shared/PositionsList.svelte`,
  `PositionTooltip.svelte`, `AccountSummary.svelte`,
  `OrderHistoryList.svelte`
