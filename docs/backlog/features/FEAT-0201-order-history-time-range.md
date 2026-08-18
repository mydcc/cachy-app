---
id: FEAT-0201
title: Filter and page order history by time range
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
estimate: 3
size: M
---

# FEAT-0201 — Filter and page order history by time range

## Problem

The History tab shows whatever the last twenty orders per bucket happen to
be. `src/routes/api/orders/+server.ts` hard-codes that limit, and there is no
way to ask for a different window, so a trader who wants to see what they did
on a particular day — or anything older than the last handful of orders —
cannot. The number of orders it takes to push a morning's trading out of view
is small.

This was split out of [`FEAT-0057`](FEAT-0057-market-activity-panel-redesign.md),
which resolved its own open question in favour of a follow-up: the work is
server-side and large enough that folding it into a display-only item would
have meant doing it badly.

## Proposal

Three pieces, in order:

1. **Server**: `startTime` / `endTime` parameters on the history request,
   passed through to Bitunix's `get_history_orders`, replacing the hard-coded
   per-bucket limit with a caller-supplied one. The existing
   `queryCanceled` two-call merge stays as it is — that is a separate quirk of
   the exchange's API and is already handled.
2. **Paging**: a cursor the client can follow, so a wide range does not have
   to arrive as one response. Bitunix pages by time rather than by offset, so
   the cursor is the oldest timestamp seen rather than a page number.
3. **UI**: a range picker on the History tab, with the sensible presets
   (today, last 7 days, last 30 days, custom) rather than only two date
   fields.

## Acceptance criteria

- [x] History can be requested for an explicit time range, and the response
      contains only orders in it
- [x] A range with more orders than one response can carry is fully
      retrievable by following the cursor, proven by a test
- [x] The existing default view still works with no range specified, and does
      not become slower
- [x] Canceled and filled orders are both present across the range, as they
      are today
- [x] Timestamps are handled in UTC end to end, matching how the exchange
      stamps them and how the daily-loss window in
      [`FEAT-0013`](FEAT-0013-risk-limits-and-kill-switch.md) is defined
- [x] German and English strings for the range picker

## Out of scope

- Exporting the filtered history. Separate concern.
- Journal integration — the journal records trades the user chose to keep;
  this is the exchange's own record.

## Open questions

- **How far back does Bitunix actually serve?** The documented retention for
  `get_history_orders` needs checking before the UI offers a range the API
  will not honour — a picker that silently returns nothing for a valid-looking
  range is worse than one that does not offer it.

## Links

- [`FEAT-0057`](FEAT-0057-market-activity-panel-redesign.md) — where this was
  split out of
- [`BUG-0056`](../bugs/BUG-0056-order-history-tab-stale.md)
- `src/routes/api/orders/+server.ts` — the hard-coded limit
- `src/components/shared/OrderHistoryList.svelte`
- `docs/bitunix-api/07_trade.md`
