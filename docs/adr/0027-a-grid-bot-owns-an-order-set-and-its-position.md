# ADR-0027: A grid bot owns an order set and the position it accumulates

- **Status:** Accepted (2026-11-23)
- **Date:** 2026-11-06
- **Deciders:** mydcc

## Context

Nothing in the repository represents a grid bot: there is no document field, no
runtime, no UI and no backlog item. The current model is one bot to zero or one
position ([`ADR-0026`](0026-a-bot-owns-the-position-it-opens.md)), which fits a
conditional entry order but not a ladder.

A grid is a different shape: many resting limit orders around a base price, a
position that accumulates as levels fill, and a budget that is shared across the
whole ladder. The paper exchange already supports resting orders, partial fills
and attached plans (`src/services/paperExchange.ts`), so the execution
primitives exist. What does not exist is a way to say "these twelve orders are
one strategy and the exposure they build is one position".

Modelling a grid as N independent bots would lose the shared budget, the shared
stop-out, and the ability to pause the whole ladder; modelling it as one limit
order would lose the rebalancing. A grid needs its own ownership shape.

## Decision

**1. A grid bot is a bot kind with its own parameters.** The document carries
`grid`: lower and upper price, level count, spacing (`arithmetic` or
`geometric`), size per level or total budget, an optional trend filter, and a
stop-out rule set. The parameters are validated by the core like any other
strategy field and are part of the content hash.

**2. It owns an order set, not a single order.** Every resting order created by
the grid carries `ownerBotId`; the net position accumulated by those fills
belongs to the same bot. Ownership is per `(symbol, side)` as in ADR-0026, with
the grid's whole ladder counted as one owner.

**3. The lifecycle is explicit.** `armed → placing → active → paused →
stopping → closed`. Pausing stops new placements and leaves protective exits
running. Stopping cancels the resting orders and closes the owned position
through `OrderGate`; it never leaves orphaned orders behind.

**4. Fills rebalance the ladder.** A filled buy level becomes eligible for a
sell level one step up (and the mirror), within the configured range. The
rebalance is a function of the book and the grid parameters, not of a hidden
per-level state machine that a reload would lose.

**5. Budget and fees are decimal.** The ladder's total exposure, the reserved
budget and the fees are `Decimal` values; no grid arithmetic uses native
numbers. The paper account's fee model applies per fill, as it does today.

**6. Paper first.** A grid runs on the paper account. Live execution stays
[`FEAT-0035`](../backlog/features/FEAT-0035-autonomous-execution-agent.md) and
needs its own gate decision; this ADR does not authorise it.

**7. Netting must be explicit.** A grid declares whether it nets against
existing exposure on the symbol or refuses to start when a manual position
exists. It may not silently mix with exposure it does not own. Point 8 settles
which: a grid refuses.

**8. A grid is hedge-style and one-sided (decided 2026-11-23).** The paper book
keys positions by `(symbol, side)`, keeps a long and a short side by side, and
merges a same-side add into the existing position without re-attributing it
(`applyOpen` in `src/services/paperExchange.ts`). Netting a grid against a
same-side position would therefore pour its fills into exposure it does not own
and lose their attribution. So a grid is either a long grid (buy levels open,
sell levels close) or a short grid (the mirror), it reserves exactly one
`(symbol, side)`, and it refuses to start while that side holds a manual
position or another bot. The opposite side stays independent. A neutral grid
holding both sides would need two reservations and is out of scope until
ADR-0026 is extended for it.

**9. The trend filter withdraws entries, never exits (decided 2026-11-23).**
When the filter turns false, the grid cancels its resting, unfilled opening
orders; counter-orders on filled levels, protective exits and the stop-out stay.
When it turns true again, the ladder is rebuilt from the document and the book
(point 4). Merely vetoing *new* levels is rejected: in an adverse trend the
resting opening orders are exactly the ones that fill, so such a filter would
protect almost nothing.

**10. A grid is sized by a quote budget (decided 2026-11-23).** The document
carries a total budget in the quote currency, split evenly across the levels.
Each level's quantity is rounded down to the symbol's quantity step, so the
ladder never exceeds the budget. `percent_risk` sizing is refused for a grid,
because a ladder has no single stop distance. Before start, the editor shows the
worst-case loss — every opening level filled, the stop-out executed, fees on
both legs included — as an amount and as a share of the paper account.

## Consequences

### What this enables

- A second bot shape that reuses the same rule store, the same gate and the same
  journal, without pretending to be a conditional entry order.
- One row in the sidebar for a whole ladder, with its level progress and its
  accumulated PnL.
- A stop-out that is testable: cancel all, close the owner's position, leave
  nothing resting.

### What this costs

- A new document shape and a runtime that manages many orders per symbol; the
  paper book and its UI currently assume a handful of orders.
- Rebalance and restart semantics that need their own tests, because a reload in
  the middle of a ladder is the normal case, not an edge case.
- More risk surface: a grid can accumulate quickly, so budget and stop-out
  limits are not optional.

### What is now forbidden

- A grid that adds to a same-side position it does not own, or one that holds
  both sides of a symbol.
- A trend filter that leaves resting opening orders in the book while it reads
  false.
- A grid whose resting orders are indistinguishable from manual orders.
- A pause that leaves the ladder placing new orders.
- A stop that cancels the ladder but leaves the position open, or closes the
  position but leaves orders resting.
- Live grid execution before FEAT-0035 and its own gate decision.

## Alternatives considered

- **N independent bots, one per level.** Rejected: no shared budget, no single
  pause, no single stop-out, and N journal identities for one strategy.
- **One large limit order with a take-profit.** Rejected: that is a bracket, not
  a grid; it cannot rebalance.
- **A market-making engine in the rule core.** Rejected for now: the core
  evaluates conditions on candles, and a grid is an execution policy, not a
  condition. Keeping it out of the evaluator preserves ADR-0012's division.
- **No grid support.** Rejected: the product goal is a bot system, and a grid is
  the shape most traders ask for after the conditional bot.
