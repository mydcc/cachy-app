---
id: FEAT-0817
title: Assist rule authoring with a model, without letting it trade
type: feature
status: specced
priority: P3
milestone: none
editions: [pro, private]
area: ai
data_class: A
adr: required
depends_on: []
parent: FEAT-0805
size: M
estimate: 8
---

# FEAT-0817 — Assist rule authoring with a model, without letting it trade

## Problem

Authoring a correct multi-condition bot is hard: the condition language has
dimensions, timeframes, warmup, veto and now exits, and a trader who describes a
setup in prose has to translate it by hand. A model is good at that translation
and bad at being trusted with the decision — and ADR-0012 forbids the second
use outright: a strategy is checkable data, not a model's opinion.

## Proposal

A build-time authoring aid, never an execution path:

1. The trader describes a setup in natural language ("buy when RSI is under 30
   and ADX above 20, exit when RSI is above 70 or MACD histogram turns
   negative").
2. A model returns a **draft** `RuleDocument` (conditions, veto, exits, action,
   provenance `source: "model"`), which is immediately validated by the Rust
   core via `ruleSchema.validate`.
3. The panel shows the refusal list and the read-back sentence; the trader edits
   and confirms.
4. Saving stores a normal document. It is **not armed**; arming stays a separate
   deliberate action.
5. The prompt and the response are Class A strategy data. Sending them to a
   hosted model is user-directed egress and needs its own ADR (see Open
   questions); a local model avoids egress but is a different product decision.
6. The model never runs in the evaluation loop. There is no "ask the model if
   this should fire" path, no confidence score that gates an order.

## Acceptance criteria

- [ ] A described setup produces a draft that the core validates; the draft's
      refusals are shown field by field, not as a wall of text.
- [ ] A saved draft is `enabled: false` and cannot be armed by the same action
      that saved it.
- [ ] `provenance.source` is `"model"` and survives promotion and duplication
      without gating any decision (ADR-0020: an unhashed field may not authorise).
- [ ] The feature is unavailable unless the trader explicitly consents to the
      chosen transport (hosted vs local); consent is stored and revocable.
- [ ] No strategy text, symbol list or journal data leaves the device on any
      other path (no telemetry, no logs).
- [ ] A prompt that cannot be expressed in the language returns "not
      expressible" with the reason, not a plausible-looking document.
- [ ] Tests mock the model and cover: valid draft, refused draft, non-expressible
      request, consent off, no auto-arm.

## Out of scope

- Execution-time AI, model-scored signals, or an agent that places orders.
- A chat UI for general trading questions.
- Fine-tuning or training on the trader's data.
- The literature library (FEAT-0818); the two can feed each other but ship
  separately.

## Open questions

- Hosted model vs local model, and the egress ADR that goes with the hosted
  option. This is the blocking decision; the item is not `ready` without it.
- Whether the model may propose exits and a stop, or only conditions. Proposal:
  conditions and exits, with the stop required before arming (ADR-0020
  decision 6).
- Whether an AI draft may be promoted straight to a bot. Proposal: no; it is a
  draft document like any other.

## Links

- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`ADR-0018`](../../adr/0018-user-directed-egress-of-class-a-announcements.md)
- [`ADR-0020`](../../adr/0020-automation-envelope-promotion-and-simulate-bots.md)
- [`FEAT-0818`](FEAT-0818-curated-literature-strategy-templates.md)
- [`TODO.md`](../../TODO.md#33-ai-assisted-rule-authoring-scope-and-egress)
