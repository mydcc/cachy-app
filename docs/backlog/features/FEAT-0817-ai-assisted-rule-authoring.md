---
id: FEAT-0817
title: Assist rule authoring with a model, without letting it trade
type: feature
status: in-progress
priority: P3
milestone: none
editions: [pro, private]
area: ai
data_class: A
adr: ADR-0030
depends_on: []
parent: FEAT-0805
size: M
estimate: 8
assignee: claude
branch: feature/feat-0817-ai-rule-authoring
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
5. The prompt and the response are Class A strategy data. The transport is
   decided in [`ADR-0030`](../../adr/0030-a-strategy-draft-goes-out-browser-direct-and-comes-back-unarmed.md):
   browser-direct to a provider from the ADR-0019 registry, under its own
   consent, never through Cachy and never through the ADR-0019 server relay.
6. The model never runs in the evaluation loop. There is no "ask the model if
   this should fire" path, no confidence score that gates an order.

## Acceptance criteria

- [ ] A described setup produces a draft that the core validates; the draft's
      refusals are shown field by field, not as a wall of text.
- [ ] A saved draft is `enabled: false` and cannot be armed by the same action
      that saved it.
- [ ] A draft carries `provenance.source: "model"` and the model's id in
      `provenance.model`. Duplication keeps both (`duplicateRule`); promotion
      resets them to `human`/absent while `derived_from_hash` names the draft,
      which is the shipped core behaviour and not to be changed (ADR-0030
      decision 7). No decision anywhere reads `provenance.source`.
- [ ] The feature is unavailable unless `aiRuleAuthoringEgress` is on. It is
      default off, revocable, independent of `aiShareTradeContext` in both
      directions, and its UI names the resolved provider and base URL.
- [ ] Before the first request the panel shows exactly what will be sent: the
      prose, the symbol, the trigger timeframe and the condition-language
      description — nothing else.
- [ ] A provider that only works through the ADR-0019 server relay is refused
      for authoring, with a reason naming the relay; there is no silent
      fallback.
- [ ] No strategy text, symbol list or journal data leaves the device on any
      other path (no telemetry, no logs).
- [ ] A prompt that cannot be expressed in the language returns "not
      expressible" with the reason, not a plausible-looking document.
- [ ] The model is reached through a port that `src/lib/rules/` and the alert
      engine do not import; the architecture ratchet proves it.
- [ ] Tests mock the model and cover: valid draft, refused draft, non-expressible
      request, consent off, relay-only provider refused, payload contains no
      journal/balance/position/hash, no auto-arm.

## Out of scope

- Execution-time AI, model-scored signals, or an agent that places orders.
- A chat UI for general trading questions.
- Fine-tuning or training on the trader's data.
- The literature library (FEAT-0818); the two can feed each other but ship
  separately.

## Decisions

Decided by the owner on 2026-11-21 and recorded, with the price each choice
carries, as [`ADR-0030`](../../adr/0030-a-strategy-draft-goes-out-browser-direct-and-comes-back-unarmed.md).

- **Hosted, and it is not a fork.** The draft request goes browser-direct to a
  provider in the ADR-0019 registry; Cachy operates no model and never receives
  the prose. A trader who wants zero egress points the feature at a loopback
  entry, so the "heavy local client" this item weighed against is already
  available as configuration (ADR-0030 decision 1).
- **Authoring gets its own consent**, `aiRuleAuthoringEgress`, default off and
  revocable, independent of `aiShareTradeContext` in both directions: the two
  admit different payloads in different directions (decision 3). The authoring
  switch does not admit Class A context — no journal, no balances, no positions
  — into a prompt (decision 4).
- **The ADR-0019 server relay is refused for authoring** and fails closed with a
  reason. That hop exists to carry a credential to a provider that will not
  answer a cross-origin request; carrying strategy prose through it would make
  Cachy a recipient of Class A strategy (decision 2). The cost is named there:
  a trader whose only provider needs the relay cannot use this feature.
- **Conditions, veto and exits — never the stop.** The stop stays the trader's
  and is required before arming (ADR-0020 decision 6). Saving is not arming:
  two actions, never one (decision 5).
- **No straight promotion of an AI draft to a bot.** It is a draft document like
  any other, and promotion is the trader's separate act.
- **Promotion does not inherit the model attribution**, which corrects this
  item's original third criterion. `RuleDocument::promote`
  (`technicals-wasm/src/rule/document.rs:745-783`) sets `source: human` and
  drops `model` on purpose, pinned by
  `a_promoted_bot_starts_disarmed_and_credits_no_model`; the lineage travels in
  `derived_from_hash` instead. Duplication does carry both
  (`src/services/alertEngine/ruleActions.ts:167`). Nothing in this item may
  change that behaviour (decision 7).

`depends_on` stays empty: promotion and duplication both ship already
(`promoteAlertToBot`, `duplicateRule`), and the provenance enum this item needs
(`AuthoringSource { Human, Model }`) is in the core since ADR-0012 decision 4.

## Links

- [`ADR-0030`](../../adr/0030-a-strategy-draft-goes-out-browser-direct-and-comes-back-unarmed.md)
  — the egress decision this item was blocked on
- [`ADR-0011`](../../adr/0011-ai-context-consent-and-local-boundary.md)
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`ADR-0018`](../../adr/0018-user-directed-egress-of-class-a-announcements.md)
- [`ADR-0019`](../../adr/0019-multi-provider-registry-and-credential-transit.md)
- [`ADR-0020`](../../adr/0020-automation-envelope-promotion-and-simulate-bots.md)
- [`FEAT-0818`](FEAT-0818-curated-literature-strategy-templates.md)
- [`TODO.md`](../../TODO.md#33--ai-assisted-rule-authoring-scope-and-egress)
