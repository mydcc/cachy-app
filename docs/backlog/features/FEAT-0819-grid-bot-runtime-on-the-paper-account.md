---
id: FEAT-0819
title: Run grid bots on the paper account
type: feature
status: in-progress
assignee: claude
branch: feature/feat-0819-grid-runtime
priority: P3
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: ADR-0027
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

- [x] A grid document with arithmetic and one with geometric spacing both
      validate and round-trip.
      *Stage 1: `GridDocument` in `technicals-wasm/src/rule/grid.rs`; Rust round-trip test for both spacings, and `gridDocument.integration.test.ts` against the rebuilt artifact.*
- [ ] The runtime places exactly `level_count` orders within the range, never
      more than the budget allows, and each order carries `ownerBotId`.
      *Stage 2 (`gridLadder.ts`): `level_count` is the number of levels, so a ladder has `level_count + 1` lines and exactly `level_count` opening slots; the budget never exceeds its cap because each slot rounds down. Placement and `ownerBotId` are stage 4.*
- [ ] A fill re-places the opposite level within the range and never outside it;
      fills and fees are `Decimal` and match the paper book's audit record.
      *Stage 2: `counterOrderOf` names the counter-order of a fill and never leaves the range; fees are `Decimal`. The match against the paper book's audit record is stage 4.*
- [ ] Pause stops new placements and leaves protective exits running; resume
      continues from the book, not from a lost in-memory ladder.
- [ ] Stop cancels every resting order owned by the grid and closes the owned
      position through the gate; a crash between cancel and close is recoverable
      on restart.
- [ ] A reload mid-ladder rebuilds the same ladder (same levels, same owner)
      from the document and the book.
- [ ] A grid refuses to start while its `(symbol, side)` holds a manual
      position or another bot; a position on the opposite side does not block
      it.
- [ ] When the trend filter reads false, every resting unfilled opening order
      of the grid is cancelled while counter-orders, exits and the stop-out
      stay; when it reads true again the ladder is rebuilt from document and
      book.
- [ ] A grid document sized with `percent_risk` is refused with a named
      reason; the quote budget is split evenly across levels as `Decimal`,
      each level's quantity rounded down to the quantity step so the ladder
      never exceeds the budget.
      *Stage 1 delivered the refusal (`GridRiskSizingUnsupported`); the even split and the step rounding are stage 2.*
- [ ] No live order path is reachable; the grid is paper-only and a `send`-level
      document is refused as today.
      *Stage 1 delivered the document half (`GridPaperOnly` for `send`); the runtime half is stage 4.*
- [ ] Tests cover budget exhaustion, range edges, pause/resume, stop-out,
      restart, and the two-grid collision case.
- [ ] The editor warns when the level spacing does not exceed the round-trip
      fee and names the minimum viable spacing derived from the paper fee
      schedule (fees apply on both legs of every level cycle).
      *Stage 2: `minimumViableSpacing` (`2f / (1 − f)`, taker fee on both legs) and `narrowestSpacing`. The warning itself is stage 5.*
- [x] The stop-out rule is a required field — empty is refused, with no
      opt-out (ADR-0027: grid budget and stop-out limits are not optional).
      *Stage 1: `GridStopOutRequired` for an empty array; an absent field does not parse.*
- [ ] The grid's review surfaces show mark-to-market equity alongside
      realized closed trades, never closed-trade-only curves.
- [ ] The editor offers an ATR-derived spacing suggestion from existing
      indicator data — a suggestion the trader accepts, never silently
      applied.
- [ ] The estimated budget (levels × size plus a fee buffer) and the
      worst-case loss (all opening levels filled, stop-out executed, fees on
      both legs included, as amount and share of the paper account) are displayed before the grid starts.
      *Stage 2: `gridExposure` and `gridWorstCase` (all opening levels filled, stop-out executed, fees on both legs, amount and share of the account). The display is stage 5.*
- [ ] A grid is bound to the paper account through `botAccount.ts`
      (ADR-0028). While paper trading is off, it reads `account_unavailable`
      and says that its ladder and its stop-out are frozen with the paper
      book. It never claims that its protective exits keep running.

## Delivery stages (2026-11-23)

The item is XL, so it ships as reviewable stages on one branch line, each
its own PR:

1. **Document in the core.** `GridDocument` as its own kind in
   `technicals-wasm` (validation, refusals, content hash) plus the TS types
   and the integration test against the rebuilt artifact. Criteria 1, 9
   (the `percent_risk` refusal), 10 (the `send` refusal) and 13.
2. **Ladder arithmetic (delivered).** A pure `Decimal` module: levels for both
   spacings, the budget split rounded down to the quantity step, the
   rebalance target for a fill, the minimum viable spacing and the
   worst-case loss. Criteria 2, 3 and 9 (math halves).
3. **Owned resting orders.** `PaperOrder` carries the owner, a fill keeps
   it, and the book can cancel by owner.
4. **Runtime.** Placement, rebalance, pause/resume, trend filter, stop and
   stop-out, restart from the book, the `(symbol, side)` reservation and the
   account binding. Criteria 2–8, 11 and 17.
5. **Editor and review surfaces.** The fee warning, the ATR suggestion, the
   pre-start budget and worst-case display, and mark-to-market reporting.
   Criteria 12, 14, 15 and 16; coordinated with FEAT-0820.

## Out of scope

- Live grid execution (FEAT-0035).
- Grid optimisation, backtests or parameter search.
- Multiple grids on one symbol and side (one owner, like a single-entry bot).
- Neutral grids that hold both sides of a symbol (ADR-0027 point 8).
- Funding-aware rebalancing; the paper book does not model funding yet.
- The chart/UI (FEAT-0820).

## Decisions (owner, 2026-11-23)

Recorded in ADR-0027 points 8–10, which is now Accepted:

- **Netting: hedge-style, one side.** The paper book keeps long and short apart
  per symbol and merges a same-side add without re-attributing it. A grid is a
  long grid or a short grid, reserves one `(symbol, side)`, and refuses to start
  while that side holds a manual position or another bot. Neutral grids are out
  of scope.
- **Trend filter: withdraw entries.** When the filter reads false, the grid
  cancels its resting unfilled opening orders and keeps counter-orders, exits
  and the stop-out; it rebuilds the ladder from document and book when the
  filter reads true again.
- **Sizing: quote budget.** A total budget in quote currency, split evenly
  across levels, each level rounded down to the quantity step; `percent_risk`
  is refused. The pre-start display shows the worst-case loss (all opening
  levels filled, stop-out executed, fees included) as an amount and as a share
  of the paper account.
- **Edition and scope:** community, paper only (TODO §34).
- **Fees:** the paper book fills resting limits at the taker fee
  (`applyOpen` → `takerFee`), so the minimum-spacing warning uses the taker fee
  on both legs.

**Provenance.** The grid requirements above that are not plain engineering —
fee-vs-spacing, the mandatory stop-out, mark-to-market reporting,
volatility-derived spacing, the budget display — are derived from industry
literature the product owner supplied and curated (trading-academy articles
and the studies they cite, including the finding that a classical grid's
expected value sits around zero before fees). Per the owner's instruction
those sources are distilled into the agent's local knowledge base and are
intentionally not cited by URL in this repository.

## Links

- [`ADR-0027`](../../adr/0027-a-grid-bot-owns-an-order-set-and-its-position.md)
- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md)
- [`FEAT-0810`](FEAT-0810-execute-bot-exits-through-the-order-gate.md)
- [`FEAT-0820`](FEAT-0820-grid-bot-controls-and-chart-visualisation.md)
- [`TODO.md`](../../TODO.md#34--grid-bots-paper-first-netting-and-edition)
- Code: `src/services/paperExchange.ts`, `src/stores/paperTrading.svelte.ts`
