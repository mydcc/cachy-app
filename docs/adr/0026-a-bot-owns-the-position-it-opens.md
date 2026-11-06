# ADR-0026: A bot owns the position it opens

- **Status:** Proposed
- **Date:** 2026-11-06
- **Deciders:** mydcc

## Context

[`ADR-0020`](0020-automation-envelope-promotion-and-simulate-bots.md) settled
how an alert becomes a bot: promotion derives a new `RuleDocument` at
`consequence_level: "simulate"`, and a firing submits a market entry plus a
stop through `OrderGate`. That decision was about *entry* and deliberately
stopped there. The consequence is visible in the code:

- `src/services/alertEngine/botOrders.ts` builds an `EntryPlan` with
  `entryType: "market"` and `takeProfits: []`, and refuses `reduce_only` with
  `reduce-only-unsupported`. There is no exit path.
- `src/lib/rules/types.ts` gives `RuleDocument` a `conditions` and a `veto`,
  but no exit field. A `veto` suppresses a trigger; it cannot close a position.
- `src/services/paperJournalService.ts` writes a journal entry for every paper
  position, but `JournalEntry` carries neither a rule id nor a content hash. A
  bot trade is indistinguishable from a manual one, so ADR-0020's statement
  that the hash is "what a journal entry records" is not true in the
  implementation.
- The paper book (`src/stores/paperTrading.svelte.ts`) has no owner on a
  position, fill or metadata row. Two bots on the same symbol and side can pass
  `hasOpenPosition` before either fill lands, and the simulator averages them
  into one position; `botOrders.ts` documents that window itself.
- `src/components/shared/PositionsSidebar.svelte` shows positions and orders. A
  bot that is armed and waiting is neither, so it is invisible until it has
  already acted.

The product goal is a bot system that works as a strategy without discarding
the conditional market order it grew from. A strategy is not a larger entry
order; it is a process that owns a trade until the trade is closed.

## Decision

**1. A bot is a process, not a flag.** The rule document remains the strategy
definition; the running instance has a lifecycle: `armed → submitting →
in_position → closing → closed`, plus `paused`, `blocked` and `expired`. State
is derived from the rule plus the paper book, not stored a second time.

**2. A position has exactly one owner.** Every position opened by a bot carries
`ownerBotId`, `ruleId` and `strategyHash`. Before an entry is submitted the bot
reserves `(symbol, side)`; the reservation closes the two-bot race. A position
with no owner is manual or legacy.

**3. Exits are part of the strategy document.** `RuleDocument` gains
`exits: ExitRule[]` (`when: Condition`, `close: "all" | "partial"`,
`fraction`). Exits are evaluated by the same core, against the same series, and
are included in the content hash because they change what the strategy means.
`external_feed` stays illegal as an exit trigger for the same reason it is
illegal as an entry trigger ([`ADR-0012`](0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
decision 7); it may still veto an entry.

**4. Exits execute through the same gate, as closes.** A triggered exit submits
a `reduce_only` close through `OrderGate` and `orderPlacementService`; it may
not open exposure and may not bypass risk limits. This preserves ADR-0020
decision 3: one route, no privileged path.

**5. Side-awareness is deterministic.** An exit is evaluated against the side of
the position the bot owns. A long bot's exit closes a long; it never turns into
a short. A bot that holds no position has no exits to evaluate.

**6. Attribution is part of the book, not a UI decoration.** `origin`, `botId`,
`ruleId` and `strategyHash` travel into paper position metadata, fills and the
journal entry. This makes the journal the place where a bot's track record is
kept, and it is the data source for reviewing a bot before keeping it.

**7. Grid bots are out of scope here.** A grid owns an order set and an
accumulated position, which is a different ownership shape;
[`ADR-0027`](0027-a-grid-bot-owns-an-order-set-and-its-position.md) decides it.

## Consequences

### What this enables

- A bot can take profit, trail, exit on a thesis change or on a time stop — the
  same condition language, a different consequence.
- Per-bot track record in the journal: trades, R, win rate, drawdown, and
  visible manual interventions.
- A sidebar that shows a bot before it acts, and a position that names the bot
  that owns it.
- A promotion ladder that keeps today's bot as the first rung instead of
  replacing it.

### What this costs

- A schema version (`exits`) and a new validation site in the core, with
  content-hash compatibility for documents that have no exits.
- More state to reason about: reservations, partial closes, a restart
  mid-exit, and a position whose owning rule was deleted.
- Every exit is a money-path change and needs human review plus tests that
  prove no double close and no accidental entry.

### What is now forbidden

- Closing a position from a rule that does not own it.
- An exit path that opens exposure, or that bypasses `OrderGate`.
- Deriving ownership from `provenance` or any other unhashed field.
- An execution-time model decision (ADR-0012).
- Treating `veto` as an exit: a veto refuses a trigger, it does not close.

## Alternatives considered

- **Keep the bot entry-only and attach a take-profit to the entry.** Rejected: a
  fixed target cannot express a thesis exit, a time stop or a trailing rule, and
  it leaves the bot unable to react to the market it watches.
- **Let a second bot close the first one's position.** Rejected: no ownership, no
  sizing against the actual position, and two bots would compete over the same
  exposure.
- **Model exits as `reduce_only` entries without a new field.** Rejected:
  `reduce_only` says *how* an order closes, not *when*; the condition still needs
  a home in the document.
- **Put grids in the same decision.** Rejected: an order set is not one
  position, and conflating them would make both models worse (ADR-0027).
