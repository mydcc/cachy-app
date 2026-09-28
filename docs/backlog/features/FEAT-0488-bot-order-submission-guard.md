---
id: FEAT-0488
title: Guard bot order submission against duplicates, stacking and unbounded repeat
type: feature
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: ADR-0012
depends_on: []
---

# FEAT-0488 — Guard bot order submission against duplicates, stacking and unbounded repeat

## Problem

A bot is a `RuleDocument` at `simulate` whose conditions hold. Nothing between "the
conditions hold" and "an order is submitted" limits how often that may happen, or notices
that it is already happening.

Three ways that goes wrong today, none of which needs a bug elsewhere to trigger:

1. **Unbounded repeat.** `frequency: "every_time"` on a 1m trigger is one market order per
   minute for as long as the condition holds. The core answers `every_time` with yes
   however often the rule has fired — by design — and `withBotOrders` has no counterpart.
   `once_per_candle_close` is the same story at a slower rate.
2. **Stacking.** Each submission builds a fresh `EntryPlan` with `tradeType` long or short
   and no reference to what is already open. Twenty fires is twenty entries in the same
   direction, each sized against an equity figure the previous nineteen have already moved.
3. **Concurrency.** `withBotOrders` fires `void submitBotOrder(...)` and returns. The
   promise is neither awaited nor tracked, so two closes arriving close together — a
   backfill, a busy series, an intrabar rule on a fast market — have two submissions in
   flight against the same rule with no in-flight guard between them.

Today the blast radius is bounded by `env.paperEnabled()`: a bot that fires with paper
trading off refuses with `paper-trading-off`, and with it on the orders route to the paper
account. That bound is a property of this item's *scope*, not of its safety. The moment
[`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md) lifts the paper gate, all three
become live-money behaviour, and they would arrive as a side effect of a different item.

This is why it is filed at P1 while nothing is at risk yet: it is cheap now and it is a
prerequisite later.

## Proposal

Put the limits in `withBotOrders`, where the decision to submit is made, not in the loop
and not in `orderPlacementService` — the gate is the trader's, and re-implementing risk
limits below it is what ADR-0012 decision 5 forbids.

- **In-flight guard.** One outstanding submission per rule id. A firing that arrives while
  the previous one has not settled is refused with its own reason, not queued.
- **Per-rule cooldown.** A minimum interval between two submissions from the same rule,
  independent of `frequency`. `frequency` says how often a rule may *announce*; this says
  how often it may *act*, and they are not the same question.
- **Open-exposure check.** A bot does not open a second position in the same direction on
  the same symbol while the first is open. Reading position state is already authorised —
  `may_read_account_state()` is true at `simulate`.

Each refusal goes through the existing `BotOrderRefusal` channel, so it is a typed member,
a toast in both locales, and deduplicated per rule and reason for free.

## Acceptance criteria

- [ ] A test fires one rule twice with the first submission still pending and asserts
      exactly one order reaches `place()`
- [ ] A test fires an `every_time` bot on consecutive closes and asserts the cooldown
      holds submissions back while the announcements continue
- [ ] A test fires a bot while a position it opened is still open and asserts no second
      entry is submitted
- [ ] Each of the three refusals is a `BotOrderRefusal` member with a message in both
      locales, enforced by the existing typed `BOT_REFUSAL_KEYS` record
- [ ] Announcements are unchanged: `inner(firing)` still receives every firing, refused
      submissions included
- [ ] The paper-trading gate is untouched

## Out of scope

- Submitting at `send` — [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md)
- Reducing or closing an existing position from a rule — same item;
  `reduce-only-unsupported` stays a refusal here
- Any risk limit that already lives inside `OrderGate`. This item adds rate and
  concurrency limits, not position sizing.

## Open questions

- Is the cooldown a fixed interval, one trigger-timeframe period, or configured per rule?
  A per-rule field is a schema change and moves the content hash; a derived default does
  not. Deriving it from `trigger_timeframe` is the cheaper answer and probably the right one.
- Should the open-exposure check read the paper position book directly, or should it track
  what this rule itself opened? The first is more correct, the second keeps the module's
  port boundary narrow.

## Links

- `src/services/alertEngine/botOrders.ts` — `withBotOrders`, `submitBotOrder`, `BotOrderRefusal`
- `src/stores/alerts.svelte.ts` — `botOrderEnvironment`, `BOT_REFUSAL_KEYS`
- `docs/adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md` — decision 5
- [`FEAT-0396`](FEAT-0396-automation-settings-tab.md) — where bot submission shipped
- [`BUG-0489`](../bugs/BUG-0489-bot-sizes-from-a-stale-anchor-close.md) — the other half of the sizing story
