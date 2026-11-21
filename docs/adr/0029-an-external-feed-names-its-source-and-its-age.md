# ADR-0029: An external feed names its source and its age, and an unreadable veto fails open

- **Status:** Accepted (2026-11-20, owner)
- **Date:** 2026-11-20
- **Deciders:** mydcc

## Context

[ADR-0012](0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
decision 7 permits a third-party aggregate to suppress a trigger and forbids it
from causing one, because such aggregates are "unversioned, unreproducible, and
outside our latency and correctness control". The rule schema has carried that
shape since: `Condition::ExternalFeed` is accepted inside `veto` and refused in
`conditions` and `exits`
(`technicals-wasm/src/rule/condition.rs:576-595`, refusal codes
`ExternalFeedTrigger` and `ExternalFeedExit`).

What was missing is the other half: nothing ever populated the values. The core
reads a feed through `MarketView::feed_value`, whose default returns `None`
(`technicals-wasm/src/rule/evaluate.rs:169-174`), and the TypeScript
`EvaluationContext.feeds` map (`src/lib/rules/types.ts:596-617`) was never
filled by the evaluation loop. A trader could author "do not take this long
while funding is extremely positive" in the veto editor (FEAT-0814) and the
rule would never be able to answer it.

Two facts decide the rest of this ADR.

**The core already refuses to guess.** `evaluate` treats an unreadable veto as
`Verdict::Indeterminate`, with the comment that such a veto "must not silently
let the trigger through, and must not silently block it either"
(`technicals-wasm/src/rule/evaluate.rs:345-357`). Indeterminate means the rule
does not fire. So the core's own behaviour is fail-closed-with-a-reason, and any
other policy has to be chosen by the caller, in the open.

**A feed has no honest history.** Funding rate, open interest and a
fear-and-greed aggregate are published as a current value. We do not control
their revisions and we do not store a versioned series of them. A backtest that
invented past feed values would be the dishonest backtest ADR-0012 decision 7
refuses.

The argument against fail-open is real and belongs here: a trader who writes
"never long while funding is extremely positive" wrote a risk limit, and an
outage at the provider is exactly the market condition in which that limit
matters most. Fail-open trades that protection for the opposite failure — a
provider outage silently freezing every strategy that names a feed, which is a
denial of service an external party can cause.

## Decision

**1. Each feed has exactly one named source, recorded with the reading.**
`funding_rate` and `open_interest_change` come from the exchange the rule is
evaluated against; `fear_greed` comes from one published aggregate. A reading is
`{ feed, source, value, asOfMs }` — never a bare number. A feed whose source is
not reachable has no reading; it is never defaulted to zero, to neutral, or to
its last known value beyond its maximum age.

**2. A reading carries its age, and an age limit refuses it.**
Every feed declares a maximum age. A reading older than that limit is stale and
is not passed into `EvaluationContext.feeds`, because a stale number inside that
map is indistinguishable from a fresh one to the core.

**3. An unavailable feed inside a veto drops the veto, and says so.**
When a rule's veto names a feed that has no fresh reading, the engine evaluates
that rule **without its veto** for that candle, and emits one visible
"veto unavailable" signal naming the rule and the feed. The whole veto is
dropped, not the single leaf: a veto group whose feed leaf is removed means
something different from what its author wrote, and "your veto did not apply"
is a sentence a trader can act on.

**4. The core keeps its semantics; the policy lives in the caller.**
`evaluate` is not changed to fire without a veto. The engine removes the veto
before it asks, so the question the core answers is always one it can answer
honestly. A caller that does not implement this policy still gets the core's
`Indeterminate`.

**5. The signal is per rule and feed, not per candle.**
The outage signal is raised once while a feed stays unavailable for a rule and
is raised again only after that feed has recovered for that rule. A feed outage
lasting an hour is one line in the log, not one per candle.

**6. A firing records the feed values it was judged against.**
A trigger suppressed by a feed veto records the feed, the compared value, the
threshold and the reading's `asOfMs`. A trigger that fired with a dropped veto
records which feed was unavailable. Both are Class A records on the device.

**7. Feed readings are Class C and carry no identity.**
Per [ADR-0001](0001-local-first-boundary.md), a reading is public market data:
cached by feed id and, where the feed is per-market, by symbol — never by rule,
bot, account or watchlist, and never sent anywhere with a user identifier.

**8. A backtest does not evaluate a feed veto; it names it.**
No stored series is replayed, and no past value is reconstructed. A backtest
treats every feed as unavailable, which under decision 3 drops the veto, and its
report must name the rules whose veto it dropped. A backtest result for a
feed-vetoed rule is therefore an upper bound on signals, and must be read as
one.

## Consequences

### What this enables

- The veto editor shipped in FEAT-0814 becomes usable: a feed condition a trader
  writes is actually answered.
- A provider outage cannot freeze a strategy, and cannot do so quietly either.
- Every suppression is auditable down to the number and the moment it was read.

### What this costs

- **A protective veto can be absent exactly when it would have mattered.** This
  is the real price of decision 3. It is paid in exchange for an external party
  not being able to halt the trader's strategies, and it is only defensible
  because of the signal in decision 5 — if that signal is ever made quiet, this
  decision has to be revisited.
- A backtest over a feed-vetoed rule overstates how often the rule would have
  fired. Decision 8 makes that visible rather than fixing it.
- Three sources mean three failure modes, three age limits and three proxy
  routes to keep healthy.

### What is now forbidden

- Writing a feed value into `EvaluationContext.feeds` without having checked its
  age against that feed's limit.
- Substituting a neutral, zero, or last-known value for an unavailable feed.
- Dropping a veto without emitting the signal from decision 3.
- Sending a user identifier, rule id, bot id or watchlist along a feed request,
  or caching a reading under any of them.
- Reconstructing a historical feed value for a backtest, or reporting a
  feed-vetoed backtest without naming the dropped veto.
- Letting a feed reach `conditions` or `exits`, which the core already refuses.

## Alternatives considered

**Fail closed: an unavailable feed refuses the trigger.** The core's current
behaviour, and the safer reading of a veto as a risk limit. Rejected by the
owner on 2026-11-20: a feed is a third-party aggregate outside our control, and
letting it decide whether a strategy runs at all hands an outside party a kill
switch over the trader's own rules. Revisit this if the outage signal ever
proves ignorable in practice.

**Per-feed choice of fail-open or fail-closed.** Honest, and the long-term
answer if traders disagree about it. Rejected for now as more UI and more states
than the first three feeds justify; decision 3 is deliberately one rule for all
feeds, so there is one sentence to explain.

**Drop only the feed leaf, keep the rest of the veto.** Preserves more of the
author's intent when the veto is a group. Rejected because the surviving group
means something its author never wrote — `none of [funding high, price low]`
with the first leaf gone is a different rule — and because "your veto did not
apply" is explainable while "part of your veto applied" is not.

**Store our own feed history and replay it.** Would make a feed-vetoed backtest
honest. Rejected as out of scope here and partly outside our reach: we would be
versioning someone else's revisions. Decision 8 states the limitation instead of
hiding it.
