---
id: FEAT-0488
title: Guard bot order submission against duplicates, stacking and unbounded repeat
type: feature
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: ADR-0012
depends_on: []
branch: feat/bot-order-submission-guard
assignee: opencode
---

# FEAT-0488 — Guard bot order submission against duplicates, stacking and unbounded repeat

## Problem

A bot is a `RuleDocument` at `simulate` whose conditions hold. Nothing between "the
conditions hold" and "an order is submitted" limits how often that may happen, or notices
that it is already happening.

Two ways that goes wrong today, none of which needs a bug elsewhere to trigger:

1. **Stacking, and no bound on the count.** Each submission builds a fresh `EntryPlan`
   with `tradeType` long or short and no reference to what is already open.
   `frequency: "every_time"` on a 1m trigger is one market order per minute for as long
   as the condition holds — twenty fires is twenty entries in the same direction, each
   sized against an equity figure the previous nineteen have already moved. The core
   answers `every_time` with yes however often the rule has fired, by design, and
   `withBotOrders` has no counterpart.

   The *rate* is not what is wrong here. `RuleEvaluationGate.evaluate` refuses an anchor
   at or before the one already decided, so a rule is asked at most once per close of
   its `trigger_timeframe`; `evaluateIntrabar` caps announcements at one per candle for
   every frequency alike. What is unbounded is the *count* — and the only thing bounding
   it today is the trader's own patience.
2. **Concurrency.** `withBotOrders` fires `void submitBotOrder(...)` and returns. The
   promise is neither awaited nor tracked, so two closes arriving close together — a
   backfill, a busy series, an intrabar rule on a fast market — have two submissions in
   flight against the same rule with no in-flight guard between them.

Today the blast radius is bounded by `env.paperEnabled()`: a bot that fires with paper
trading off refuses with `paper-trading-off`, and with it on the orders route to the paper
account. That bound is a property of this item's *scope*, not of its safety. The moment
[`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md) lifts the paper gate, both become
live-money behaviour, and they would arrive as a side effect of a different item.

This is why it is filed at P1 while nothing is at risk yet: it is cheap now and it is a
prerequisite later.

## Proposal

Put the limits in `withBotOrders`, where the decision to submit is made, not in the loop
and not in `orderPlacementService` — the gate is the trader's, and re-implementing risk
limits below it is what ADR-0012 decision 5 forbids.

- **In-flight guard.** One outstanding submission per rule id. A firing that arrives while
  the previous one has not settled is refused with its own reason, not queued.
- **Open-exposure check.** A bot does not open a second position in the same direction on
  the same symbol while the first is open. It reads the position book through the
  environment's account-state reader rather than tracking what this rule itself opened, so
  the refusal also holds against a position the trader opened by hand or that another rule
  opened — stacking onto a foreign position is one of the two failures this item exists to
  stop, and a per-rule memory cannot see it. This is the limit that bounds the *count*: a
  rule whose first entry is still open cannot add to it on the next fire, however many
  candles pass.

Each refusal goes through the existing `BotOrderRefusal` channel, so it is a typed member,
a toast in both locales, and deduplicated per rule and reason for free.

## Acceptance criteria

- [x] A test fires one rule twice with the first submission still pending and asserts
      exactly one order reaches `place()`
- [x] A test fires a bot while a position it opened is still open and asserts no second
      entry is submitted
- [x] A test fires a bot against a position that was **not** opened by that rule — already
      open when the bot first fired — and asserts the same-direction entry is still refused
- [x] A test fires a bot across many consecutive trigger closes and asserts the number of
      entries reaches one and stays there, which is the count the exposure check exists to
      bound
- [x] Each of the two refusals is a `BotOrderRefusal` member with a message in both
      locales, enforced by the existing typed `BOT_REFUSAL_KEYS` record
- [x] Announcements are unchanged: `inner(firing)` still receives every firing, refused
      submissions included
- [x] The paper-trading gate is untouched
- [x] The environment gains a position reader, and it is reachable only from the `simulate`
      path a bot rule is admitted through — a `notify` or `send` rule never reaches it

## Implementation note — branch `feat/bot-order-submission-guard`

Three decisions the proposal left open, settled against the code.

**The exposure check sits in `submitBotOrder`, not in `withBotOrders`.** The
proposal says to put both limits in `withBotOrders`, but the contrast that
sentence draws is against *the loop* and *`orderPlacementService`* — neither of
which is `submitBotOrder`. The in-flight guard genuinely belongs to
`withBotOrders`, because the outstanding promise is the caller's and only the
caller can release it. The exposure check carries no such constraint and belongs
with the other nine refusals, so a direct caller of `submitBotOrder` is covered
too. AC 8 still holds: `submitBotOrder` is reached only from `withBotOrders`
after `isBot`, and both non-submitting levels return above it.

**Which book the reader asks is mode-dependent, and this is the load-bearing
detail.** `paperAccountFeed.positions()` reads `paperState.positions` and feeds
`accountState.hydratePositions` — but on a refresh tick, while `paperState`
itself is written synchronously the moment an entry fills
(`paperExchange.ts::applyEntry`). Reading only `accountState.positions` in paper
mode would reopen the exact window the guard exists to close: the first entry
not yet mirrored, the second one through. So the reader asks
`paperState.positions` when paper trading is on and `accountState.positions`
otherwise — the book the bot's own order lands in. This reads like a
simplification waiting to happen and is not one.

**Refusal order is shape before state.** The exposure check sits after
`no-order` / `paper-trading-off` / `reduce-only-unsupported` / `no-stop` and
before `closeAt` / `livePrice`. A bot holding the position has a durable
explanation, and one told `no-live-price` will go looking for a price problem
that is not there; the reverse order reports a state fact for a rule the trader
can fix by editing it.

### What the tests had to change, and why it is not incidental

The in-flight slot is released in `finally`, the last link in the promise
chain. Four existing cases fired back-to-back firings and would now be refused
as concurrent — including BUG-0491's anchor-gate case, whose second firing is a
*later candle*. They now wait on a named `settle()` helper between firings.

That is not the tests bending to the implementation. Real firings arrive a whole
trigger timeframe apart, and the guard's whole claim is that it binds only
submissions genuinely in flight. `settle()` says which of the two things a test
means, and its comment says so, because deleting it makes four cases fail for a
reason none of them mentions.

One case is worth naming: `says why once per rule, not once per candle` fired
three times in one tick and asserted a single message. That is now *two* —
`paper-trading-off` and `submission-in-flight` — because the second firing is
genuinely refused for a different reason. The case was changed to settle between
firings rather than to accept two messages: the dedup it tests is per rule *and
reason*, and accepting two would have quietly stopped testing it.

### Verified, not asserted

Each guard was removed in turn and the suite re-run. Removing the exposure check
fails four cases; removing the in-flight guard fails two; collapsing the side
mapping (`buy` / `sell` → `long` / `long`) fails two; moving the release out of
`finally` into the refusal branch — which is what leaks the slot when a
submission throws — fails one. A first attempt at that last mutation (swapping
`finally` for a trailing `then`) changed nothing and taught the useful lesson:
`.then().catch().then()` still releases, so the mutation has to be the one a
careless implementation would actually write.

## Out of scope

- Submitting at `send` — [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md)
- Reducing or closing an existing position from a rule — same item;
  `reduce-only-unsupported` stays a refusal here
- Any risk limit that already lives inside `OrderGate`. This item adds rate and
  concurrency limits, not position sizing.
- A per-rule cooldown. Considered and dropped — see [Decisions](#decisions). The one
  case a cooldown would have caught, a burst of anchors during a refill, is already
  covered by the in-flight guard for as long as a submission is outstanding.

## Decisions

- **No per-rule cooldown.** A previous revision of this item derived a cooldown
  interval from `trigger_timeframe`, on the reasoning that a 1m rule should act at
  most once a minute. That is inert, and the reason is worth keeping: the
  evaluation gate already refuses a second evaluation of the same trigger anchor,
  so a rule is asked at most once per close of its timeframe regardless of
  `frequency`. A cooldown equal to the timeframe is satisfied by every submission
  the gate would otherwise have let through, and it would have refused nothing.
  The proposal's original framing — "`frequency` says how often a rule may
  announce, this says how often it may act" — is a real distinction, but not one a
  per-rule interval can enforce here, because the two rates are already equal.

  The failure it was aimed at is real; the mechanism was not. What is unbounded is
  the *count* of entries while a condition holds, not their rate, and the exposure
  check is the limit that bounds it. Dropping the cooldown leaves two guards that
  each do work rather than three where one did not.

## Links

- `src/services/alertEngine/botOrders.ts` — `withBotOrders`, `submitBotOrder`, `BotOrderRefusal`
- `src/stores/alerts.svelte.ts` — `botOrderEnvironment`, `BOT_REFUSAL_KEYS`
- `docs/adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md` — decision 5
- [`FEAT-0396`](FEAT-0396-automation-settings-tab.md) — where bot submission shipped
- [`BUG-0489`](../bugs/BUG-0489-bot-sizes-from-a-stale-anchor-close.md) — the other half of the sizing story
