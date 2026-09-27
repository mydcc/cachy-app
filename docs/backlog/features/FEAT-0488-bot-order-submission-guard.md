---
id: FEAT-0488
title: Guard bot order submission against duplicates, stacking and unbounded repeat
type: feature
status: ready
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
  how often it may *act*, and they are not the same question. The interval is **derived from
  `trigger_timeframe`**, not a field of its own: a 1m rule may act at most once a minute, a
  1d rule once a day. A field would be more flexible, but it is a schema change and it moves
  the content hash of every existing rule document — churn for a limit whose correct value
  the trader has already stated by choosing a timeframe.
- **Open-exposure check.** A bot does not open a second position in the same direction on
  the same symbol while the first is open. It reads the position book through the
  environment's account-state reader rather than tracking what this rule itself opened, so
  the refusal also holds against a position the trader opened by hand or that another rule
  opened — stacking onto a foreign position is one of the three failures this item exists to
  stop, and a per-rule memory cannot see it. Reading position state is already authorised:
  `may_read_account_state()` is true at `simulate`, so this widens the environment by one
  reader, not the authorisation.

Each refusal goes through the existing `BotOrderRefusal` channel, so it is a typed member,
a toast in both locales, and deduplicated per rule and reason for free.

## Acceptance criteria

- [ ] A test fires one rule twice with the first submission still pending and asserts
      exactly one order reaches `place()`
- [ ] A test fires an `every_time` bot on consecutive closes and asserts the cooldown
      holds submissions back while the announcements continue
- [ ] The cooldown interval is derived from `trigger_timeframe`, and no field is added to
      the rule document schema or to its content hash
- [ ] A test fires a bot while a position it opened is still open and asserts no second
      entry is submitted
- [ ] A test fires a bot against a position that was **not** opened by that rule — already
      open when the bot first fired — and asserts the same-direction entry is still refused
- [ ] Each of the three refusals is a `BotOrderRefusal` member with a message in both
      locales, enforced by the existing typed `BOT_REFUSAL_KEYS` record
- [ ] Announcements are unchanged: `inner(firing)` still receives every firing, refused
      submissions included
- [ ] The paper-trading gate is untouched
- [ ] The environment gains a position reader, and it is reached only where
      `may_read_account_state()` already holds

## Out of scope

- Submitting at `send` — [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md)
- Reducing or closing an existing position from a rule — same item;
  `reduce-only-unsupported` stays a refusal here
- Any risk limit that already lives inside `OrderGate`. This item adds rate and
  concurrency limits, not position sizing.

## Links

- `src/services/alertEngine/botOrders.ts` — `withBotOrders`, `submitBotOrder`, `BotOrderRefusal`
- `src/stores/alerts.svelte.ts` — `botOrderEnvironment`, `BOT_REFUSAL_KEYS`
- `docs/adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md` — decision 5
- [`FEAT-0396`](FEAT-0396-automation-settings-tab.md) — where bot submission shipped
- [`BUG-0489`](../bugs/BUG-0489-bot-sizes-from-a-stale-anchor-close.md) — the other half of the sizing story
