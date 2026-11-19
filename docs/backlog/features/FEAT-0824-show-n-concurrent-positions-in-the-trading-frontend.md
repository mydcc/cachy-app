---
id: FEAT-0824
title: Show N concurrent positions in the trading frontend
type: feature
status: in-progress
assignee: claude
branch: feature/feat-0824-n-concurrent-positions
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: ADR-0026
depends_on: [FEAT-0806, FEAT-0807]
parent: FEAT-0805
size: L
estimate: 8
---

# FEAT-0824 — Show N concurrent positions in the trading frontend

## Problem

The trading frontend is built around a single open position per symbol. The
product owner's reality check (review round, 2026-11-18): a trader with twenty
bots — ten small RSI bots, ten weekly-chart bots — would make the frontend
obsolete with his own automation: the overview, the PnL view and the risk
summary must carry *many* concurrent positions, each owned by its bot
(ADR-0026) or by hand.

The ownership model this needs is specced in this epic — attribution in
FEAT-0806, the `(symbol, side)` reservation in FEAT-0822 (ADR-0026) — so
the presentation lift builds on a defined model. The UI today cannot
represent a fleet; this item lifts the presentation layer to what the bot
era requires.

## Proposal

- The positions sidebar lists **N** concurrent positions without a
  "one position" assumption: sortable by symbol, owner, PnL, age; grouped
  view optional.
- Every position row keeps position-like information density (owner badge,
  entry, stop/TP, live PnL, link to the owning bot row — FEAT-0808).
- Manual and bot positions are visually distinguishable at a glance without
  separate lists.
- Aggregate figures (total PnL, total exposure, open risk) are computed with
  `Decimal` and update with the book, not per-position polling.
- The journal (FEAT-0812) and the confirmation/risk surfaces handle N
  positions without truncation or pagination bugs.
- The review surfaces state the **mark-to-market** truth (see FEAT-0819's
  closed-trades warning): open-position drawdown is visible, not hidden
  behind realized-trade curves.

## Acceptance criteria

- [ ] Ten simultaneous positions across five symbols and three bots render
      correctly, each with its own owner attribution and stop/TP data.
- [ ] Aggregates are exact under `Decimal` and match the book after a reload
      (reconciliation included).
- [ ] Sorting, filtering and grouping never drop or duplicate a position row.
- [ ] A manual position among bot positions is distinguishable without
      opening anything.
- [ ] Keyboard navigation and accessible names cover the list at N=20+ rows.
- [ ] Component tests cover: N positions mixed ownership, reload
      reconciliation, aggregate math, empty and single states.

## Out of scope

- Multiple positions on the *same* symbol and side (netting stays one-way per
  ADR-0026; ownership keeps one owner per `(symbol, side)`).
- Multi-account separation (FEAT-0825).
- Portfolio-level risk limits (FEAT-0822 is per-bot first).

## Open questions

- Whether the positions tab gains sub-grouping by owner or by symbol.
  Proposal: sort by symbol, owner as a filter — grouping adds chrome before
  the fleet sizes demand it.

## Links

- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md)
- [`FEAT-0805`](FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
- [`FEAT-0806`](FEAT-0806-attribute-paper-trades-and-journal-entries-to-their-bot.md)
- [`FEAT-0808`](FEAT-0808-show-bots-in-the-positions-sidebar.md)
- Code: `src/components/shared/PositionsSidebar.svelte`,
  `src/stores/paperTrading.svelte.ts`
