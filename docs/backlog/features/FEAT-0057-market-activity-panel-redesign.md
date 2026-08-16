---
id: FEAT-0057
title: Show the full Bitunix position/order dataset in the Market Activity panel
type: feature
status: done
branch: claude/feat-0011-erledigen-k3fht2
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
estimate: 5
size: L
target_date: 2027-01-08
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
2. ~~**Positions card: margin rate + realized PnL**~~ — done. `marginRate`
   and `realizedPnl` (Bitunix API field `realizedPNL`,
   `docs/bitunix-api/05_position.md:103-129`) now flow through
   `NormalizedPosition` → `/api/positions` → the `Position` store type →
   `PositionsList.svelte`/`PositionTooltip.svelte`. `realizedPnl` updates
   live over WS (the position channel sends it on every push); `marginRate`
   is REST-only and preserved across WS updates like `liquidationPrice`.
   Bitget is intentionally left unmapped for both — no verified field name
   for either on Bitget's position endpoint (see BUG-0001 for why guessing
   an exchange's wire format is the thing to avoid here).
   - ~~**Still open**: Quote-equivalent size and inline TP/SL~~ — done, and
     the design pass the note asked for is below. Quote-equivalent size
     (`qty × markPrice`, falling back to entry) sits next to the base size on
     the card. Inline TP/SL reads a shared cache rather than triggering a
     second fetch — see "The TP/SL design pass".
3. ~~**History: `reduceOnly` badge**~~ — done. The server route dropped the
   field when mapping `get_history_orders`; now carried through and shown as
   a small badge next to the type/side badge. A time-range filter and
   pagination beyond the server's hard-coded last-20-per-bucket limit
   (`src/routes/api/orders/+server.ts:452`) is real but large enough to need
   its own spec — tracked here as an open question, not committed to in this
   item.
4. ~~**Account summary: Total Position Size**~~ — done. `Σ size ×
   mark/entry price` across `mappedPositions`, client-computed exactly like
   Bitunix's own Assets panel does (no API field exists for it).

## Acceptance criteria

- [x] Mark price on an open position updates live and never renders as `0`
      or a stale value (see `BUG-0055`'s acceptance criteria)
- [x] Margin rate and realized PnL are visible on an open position's card
- [x] A position's active TP/SL (if set) is visible on the card itself, not
      only in the separate TP/SL tab
- [x] History shows `reduceOnly` per order
- [x] Account summary shows total open position size
- [x] German and English strings for every new label
- [x] `npm run check` and the affected Vitest suites pass

## Out of scope

- New trading actions (Reverse, Add/Reduce Margin, Partial Close, editing
  Trailing TP/SL) — these are `FEAT-0023`.
- Server-side history time-range filtering/pagination — real gap, needs its
  own spec (see `BUG-0056`'s "Out of scope").

## The TP/SL design pass

The note above named the real constraint: `TpSlList` fetches plans from a
dedicated endpoint, so "render what we already have" was never on offer. The
choice was an eager fetch the card does not need, or reusing the list's
on-demand fetch some other way.

Neither, exactly — **one cache both consumers read**
(`src/stores/tpsl.svelte.ts`). The fetch happens when plans are about to be
displayed, which is when the positions tab is open with at least one position,
or when the TP/SL tab opens, whichever comes first. Within a 30-second window
the second consumer is free, and concurrent callers share one request.

What this costs, stated plainly: a trader who keeps the Positions tab open and
never opens the TP/SL tab now makes requests they previously did not — one
window's worth, batched five symbols at a time by the existing service. What
it saves: opening the TP/SL tab after looking at positions used to refetch
unconditionally and now usually does not.

Only *pending* plans are cached. A closed plan cannot belong to an open
position, so the history view stays `TpSlList`'s own concern.

The cache is invalidated on every edit, cancel and position close, and reset
when the account or exchange changes — a stop shown on a card after the
position is gone would be worse than showing none.

## Resolved questions

- **Should the history time-range filter ship here or as its own follow-up?**
  → **Follow-up**, as the note leaned. It is server-side work — new
  `startTime`/`endTime` parameters, replacing the hard-coded per-bucket limit,
  a time cursor for paging, and a range picker — and none of it is display of
  data the API already returns, which is what this item scoped itself to.
  Written up as [`FEAT-0201`](FEAT-0201-order-history-time-range.md) rather
  than left as a leaning, so the decision has somewhere to live.

## Links

- [`FEAT-0201`](FEAT-0201-order-history-time-range.md) — the history
  time-range follow-up split out of this item

- [`BUG-0055`](../bugs/BUG-0055-position-mark-price-always-zero.md)
- [`BUG-0056`](../bugs/BUG-0056-order-history-tab-stale.md)
- [`FEAT-0023`](FEAT-0023-position-management.md) — action side, not display
- `docs/bitunix-api/05_position.md`, `04_market.md`, `08_websocket.md`
- `src/components/shared/PositionsList.svelte`,
  `PositionTooltip.svelte`, `AccountSummary.svelte`,
  `OrderHistoryList.svelte`
