---
id: FEAT-0304
title: Let the assistant propose a rule the trader arms
type: feature
status: idea
priority: P2
milestone: M8
editions: [pro, private]
area: ai
data_class: A
adr: ADR-0012
depends_on: [FEAT-0303, FEAT-0019]
start_date: 2026-08-25
target_date: 2027-12-31
size: M
estimate: 5
---


# FEAT-0304 Let the assistant propose a rule the trader arms

## Problem

M8 gives the assistant the ability to form a market view
([`MILESTONES.md`](../../MILESTONES.md) M8). A view a trader cannot act on
without retyping it is half a feature; a view the assistant acts on itself is M9
arriving early through the back door.

There is also a quieter problem. An assistant that answers in prose leaves no
record that can be checked later. "It suggested longs around here" is not
reviewable. A proposal that is a rule document is.

## Proposal

The assistant may emit a rule document in
[`FEAT-0303`](FEAT-0303-strategy-rule-schema.md)'s schema, accompanied by its
reasoning and a stated confidence. The document arrives **inert**: parsed,
validated, displayed in plain language, and armed only by an explicit human
action.

Per [ADR-0012](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
decision 4, a model-authored rule is held to exactly the validation a hand-built
rule is held to, and carries `source: model` in its provenance so a later review
can ask whether model-authored rules did better or worse than hand-built ones.

Sending an existing rule to a model for critique is context sharing under
[ADR-0011](../../adr/0011-ai-context-consent-and-local-boundary.md): default off,
explicit, per request — a rule is strategy, which is Class A.

## Acceptance criteria

- A model response that is not a valid rule document is refused with a stated
  reason, and nothing is armed
- A proposed rule is inert until a human arms it, proven by a test that a
  proposal alone changes no armed state
- The proposal is displayed in plain language in both locales before arming
- Provenance records `source: model`, the model identifier, and the schema version
- No model response can edit, disable or re-arm an existing rule
- Rules are not sent to any provider unless context sharing is explicitly enabled
  for that request
- A proposal and its later outcome are both recorded locally, so the pair can be
  reviewed

## Out of scope

- Executing a proposal — that is M9 and `FEAT-0035`
- Ranking or auto-selecting among several proposals
- Any training, fine-tuning or weight shipping; per ADR-0012 decision 8 what
  accumulates is a local register of proposals and outcomes

## Open questions

- **Which model tier is honest for this?** Proposing a rule is reasoning work;
  reformatting one is not. Whether the item mandates a capable model, or simply
  refuses malformed output regardless of model, decides how it behaves on a small
  local Ollama.
- **What confidence means when the model states it.** A stated confidence that is
  never checked against outcomes is decoration. Either the register scores it, or
  the field should not exist.

## Links

- [ADR-0012](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [ADR-0011](../../adr/0011-ai-context-consent-and-local-boundary.md)
- [`FEAT-0303`](FEAT-0303-strategy-rule-schema.md) — the schema proposals must match
- [`FEAT-0019`](FEAT-0019-agentic-web-search.md) — where the assistant's own
  information gathering lives
- [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md) — the line this item
  does not cross
- `AiRequestSchema` ([`src/types/ai.ts:33`](../../../src/types/ai.ts))
