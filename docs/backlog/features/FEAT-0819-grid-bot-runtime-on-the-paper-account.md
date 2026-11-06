---
id: FEAT-0819
title: Run grid bots on the paper account
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: required
depends_on: [FEAT-0810]
parent: FEAT-0805
size: XL
estimate: 21
---

# FEAT-0819 — Run grid bots on the paper account

## Problem

A grid bot does not exist anywhere in the product. The current bot model is one
entry and at most one position; a grid needs a ladder of resting orders, a
shared budget and an accumulated position. Without it, a trader who runs grids
on an exchange has no way to rehearse or track one here, and the bot system
stops at the single-entry shape.

## Proposal

Implement the grid as its own bot kind, per
[`ADR-0027`](../../adr/0027-a-grid-bot-owns-an-order-set-and-its-position.md):

- **Document.** A grid document carries: symbol, lower/upper price, level count,
  spacing (`arithmetic` | `geometric`), size per level or total budget, optional
  trend filter (a `Condition`), and stop-out rules (`Condition[]`, same language
  as exits). It shares provenance, content hashing and the gate envelope with
  `RuleDocument`; it does not pretend to have a trigger `Condition`, which is
  why it is a distinct kind rather than a rule with a reused field.
- **Runtime (paper only).** Place the ladder as resting limit orders owned by the
  grid; on a fill, re-place the opposite level one step away within the range;
  never exceed the budget; apply the paper fee model per fill. Pause stops new
  placements and leaves protective exits running. Stop cancels every resting
  order and closes the owned position through `OrderGate`.
- **Ownership.** Every order and the accumulated position carry `ownerBotId`;
  the grid reserves `(symbol, side)` like a single-entry bot. A grid may not
  start on a symbol with a manual position unless its netting policy says so.
- **Restart.** Rebuild the ladder from the document plus the book after a
  reload; a reload mid-ladder is the normal case, not an edge case.
- **Stop-out.** Evaluated on the same cadence as exits; it cancels the ladder
  first, then closes, so a crash between the two cannot leave resting orders
  without a position or a position without protection.

## Acceptance criteria

- [ ] A grid document with arithmetic and one with geometric spacing both
      validate and round-trip.
- [ ] The runtime places exactly `level_count` orders within the range, never
      more than the budget allows, and each order carries `ownerBotId`.
- [ ] A fill re-places the opposite level within the range and never outside it;
      fills and fees are `Decimal` and match the paper book's audit record.
- [ ] Pause stops new placements and leaves protective exits running; resume
      continues from the book, not from a lost in-memory ladder.
- [ ] Stop cancels every resting order owned by the grid and closes the owned
      position through the gate; a crash between cancel and close is recoverable
      on restart.
- [ ] A reload mid-ladder rebuilds the same ladder (same levels, same owner)
      from the document and the book.
- [ ] A grid refuses to start on a symbol with a manual position unless its
      netting policy explicitly allows it.
- [ ] No live order path is reachable; the grid is paper-only and a `send`-level
      document is refused as today.
- [ ] Tests cover budget exhaustion, range edges, pause/resume, stop-out,
      restart, and the two-grid collision case.

## Out of scope

- Live grid execution (FEAT-0035).
- Grid optimisation, backtests or parameter search.
- Multiple grids on one symbol and side (one owner, like a single-entry bot).
- Funding-aware rebalancing; the paper book does not model funding yet.
- The chart/UI (FEAT-0820).

## Open questions

- Netting mode: one-way net against existing exposure, or hedge-style separate
  positions. The paper book's behaviour must be stated, not assumed.
- Whether the trend filter may pause the grid or only veto new levels. Proposal:
  pause new levels, keep the ladder and the exits.
- Whether a grid may use `percent_risk` sizing; a ladder has no single stop, so
  the basis may need to be `quote_notional` or a per-level size.

## Links

- [`ADR-0027`](../../adr/0027-a-grid-bot-owns-an-order-set-and-its-position.md)
- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md)
- [`FEAT-0810`](FEAT-0810-execute-bot-exits-through-the-order-gate.md)
- [`FEAT-0820`](FEAT-0820-grid-bot-controls-and-chart-visualisation.md)
- [`TODO.md`](../../TODO.md#34-grid-bots-paper-first-netting-and-edition)
- Code: `src/services/paperExchange.ts`, `src/stores/paperTrading.svelte.ts`
