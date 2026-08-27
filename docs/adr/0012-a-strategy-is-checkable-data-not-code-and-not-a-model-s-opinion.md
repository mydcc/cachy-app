# ADR-0012: A strategy is checkable data, not code and not a model's opinion

**Status:** Proposed
**Date:** 2026-08-25
**Deciders:** @mydcc

## Context

Three milestones in [`MILESTONES.md`](../MILESTONES.md) describe what looks like
three separate products: M4 arms conditions and notifies
([`FEAT-0027`](../backlog/features/FEAT-0027-alert-engine.md) is done,
[`FEAT-0028`](../backlog/features/FEAT-0028-indicator-alerts.md) specced,
[`FEAT-0030`](../backlog/features/FEAT-0030-combined-alerts.md) an idea), M8 has an
assistant that forms a market view, M9 has an agent that trades within limits
([`FEAT-0035`](../backlog/features/FEAT-0035-autonomous-execution-agent.md)).

They are not three things. "RSI below 30 on the 4h close" is one sentence
evaluated at three levels of consequence: notify, simulate, send. Built as three
implementations they will eventually disagree, and the place they disagree is
between what the trader backtested and what the machine actually did. That gap is
the money.

Two further forces make the decision due now rather than at M9.

**The assistant already exists and the obvious next step is the unauditable
one.** Five provider proxies are live under
`src/routes/api/ai/` behind one request shape
(`AiRequestSchema`, [`src/types/ai.ts:33`](../../src/types/ai.ts)).
[ADR-0011](0011-ai-context-consent-and-local-boundary.md) settled what data may
reach a model. It did not settle what a model's *output* is allowed to be. If the
answer is "code", nothing downstream can diff it, replay it, or refuse it for a
stated reason — and [ADR-0005](0005-extension-model.md) already recorded what
arbitrary code in this app's session is worth: it reaches `localStorage`, every
allowed origin, and the order path.

**An execution gate already exists, and a second path around it is the classic
way this goes wrong.** `OrderGate.verify`
([`src/services/orderGate.ts:467`](../../src/services/orderGate.ts)) and
`OrderGate.submit` (`:1085`), reached via `TradeService.gatedRequest`
([`src/services/tradeService.ts:456`](../../src/services/tradeService.ts)),
refuse when what was displayed and what would be sent disagree.
[ADR-0010](0010-estimates-inform-but-never-determine-what-is-sent.md) recorded
the cost of letting two conventions coexist on one screen. An automated sender
with its own path is that same mistake with no human present to notice.

The indicator side is ready for this and does not need reinventing: batch
evaluation via `calculateIndicatorsFromArrays`
([`src/utils/technicalsCalculator.ts:113`](../../src/utils/technicalsCalculator.ts))
and incremental updates via `StatefulTechnicalsCalculator.update`
([`src/utils/statefulTechnicalsCalculator.ts:71`](../../src/utils/statefulTechnicalsCalculator.ts)).

## Decision

**1. A strategy is a serialisable rule document, never code.**
Conditions, operators, timeframes, thresholds and the intended action are data
with a declared schema. A rule can be printed, diffed, hashed, versioned,
reviewed and refused. Nothing evaluates a rule by executing text a user or a
model supplied.

**2. One schema serves alerting, backtesting, paper and live.**
The same document that fires a notification at M4 is the document a backtest
replays and the document an agent executes at M9. A capability a level does not
have is refused explicitly, in the manner of
[ADR-0008](0008-refuse-unsupported-verbs-before-they-travel.md) — never emulated
by a second dialect.

**3. Rules evaluate on closed candles.**
The evaluation point is candle close, on the timeframe the rule names. Intrabar
values may be displayed; they do not decide. This is what makes a backtest result
and a live result the same claim, and it is the only cheap defence against
repainting.

**4. The model proposes. The engine decides. The gate executes.**
An assistant may emit a rule document, an explanation, and a confidence. It never
emits an order, never mutates an armed rule, and its output is inert until a human
arms it. A model is a source of *candidates*, held to the same schema validation
as a hand-built rule.

**5. Every automated order enters through the gate a human click enters.**
No privileged path, no latency exception, no "the agent already checked". The
limits and kill switch of
[`FEAT-0013`](../backlog/features/FEAT-0013-risk-limits-and-kill-switch.md) apply
to machine-originated orders exactly as to manual ones.

**6. Rule documents, proposals, and decision logs are Class A.**
Per [ADR-0001](0001-local-first-boundary.md): what a trader watches and what a
bot is permitted to do is strategy, and it stays on the device. Sending a rule to
a model for critique is context sharing under
[ADR-0011](0011-ai-context-consent-and-local-boundary.md) — default off,
explicit, per request.

**7. External market context may veto or annotate. It may never trigger.**
Third-party aggregates (market-cap screeners, liquidation heatmaps, funding,
sentiment) are unversioned, unreproducible, and outside our latency and
correctness control. They may suppress or downgrade a trigger, or be recorded
alongside it. A rule whose firing condition *is* such a feed is refused, because
a backtest over it cannot be honest.

**8. What improves over time is a register, not a model.**
Cachy does not train, fine-tune or ship weights. Learning means: proposals and
their outcomes are recorded locally and evaluated against what happened, so that
a strategy's record is a fact the trader can read — not a claim a model makes
about itself.

## Consequences

### What this enables

- A rule tested at M4 is the same object executed at M9, so "it backtested well"
  and "it ran well" become comparable statements rather than two stories.
- Model providers become interchangeable. A rule document is provider-neutral, so
  swapping OpenAI for a local Ollama or any OpenAI-compatible gateway changes who
  suggests, never what runs.
- An audit answers "why did this order exist" with a rule hash, the closed candle
  that satisfied it, and the gate verdict — not with a prompt transcript.
- The Rust/WASM evaluation core M4 already commits to
  (see [`MILESTONES.md`](../MILESTONES.md) M4 and
  [`IDEA-0037`](../backlog/ideas/IDEA-0037-android-alert-companion.md)) becomes
  the bot engine too, rather than a parallel one.

### What this costs

- Expressiveness. A schema cannot say everything code can. Some genuinely wanted
  strategy will not be expressible, and the honest answer will be "not yet, and
  here is the schema version that would need to change" — not "write a script".
- Schema versioning becomes permanent work. Every armed rule carries the version
  it was authored under, and every migration must preserve meaning or refuse to
  migrate.
- Candle-close evaluation is slower than tick evaluation and will lose entries a
  faster system catches. That is the price of the backtest and the live run being
  the same claim.
- The assistant will look weaker than a competitor's, because it cannot act. It
  is meant to.

### What is now forbidden

- Storing or evaluating a strategy as executable text (JavaScript, expression
  eval, template execution) from any source, model or user.
- Any order-sending path that does not pass `OrderGate`.
- Any rule whose *trigger* is a third-party aggregate feed rather than exchange
  candle or account data.
- Arming, editing, or enabling a rule as a direct effect of a model response.
- Sending rule documents, proposal history or decision logs off the device by
  default, in telemetry, or in debug logs.
- Deciding on intrabar values in any rule that a backtest is allowed to claim
  results for.

## Alternatives considered

**Let users write strategies as sandboxed code.** Rejected on
[ADR-0005](0005-extension-model.md)'s reasoning: isolation must come before
capability, and a compromised strategy here reaches a funded account rather than
a website. A schema is not the weaker option — it is the one that can be refused
for a stated reason.

**Let the model call trading tools directly (function calling to place orders).**
Rejected. It collapses proposal and execution into one step whose reasoning
cannot be replayed, and it makes commitment 2 in [`VISION.md`](../VISION.md) a
matter of prompt quality rather than structure.

**Separate rule formats per level — cheap alert conditions, richer bot
strategies.** Rejected: it is exactly the divergence this ADR exists to prevent.
One schema with levels that refuse what they cannot honour costs less than two
that drift.

**Tick-level evaluation for responsiveness.** Rejected for triggers. Indicator
values move within a bar, so a signal can appear and vanish, and no backtest over
closed bars can honestly describe that behaviour. Revisit only with a
tick-accurate backtest to compare against.

**Defer all of this until M9.** Rejected: by M9 there would be an alert format, a
backtest format, and an agent format already in the field, and unifying them
would mean migrating armed rules on live accounts. The schema is cheap now and
expensive later; the autonomy envelope (capital limits, failure modes, live
promotion) is the opposite and is deliberately left to its own ADR near M9, as
[`FEAT-0035`](../backlog/features/FEAT-0035-autonomous-execution-agent.md)
requires.
