---
id: IDEA-0829
title: Use the trader's connected AI agent for bot authoring and audit — never execution
type: idea
status: idea
priority: P3
milestone: none
editions: [pro, private]
area: ai
data_class: A
adr: ADR-0012
depends_on: [FEAT-0817]
size: M
estimate: 8
---

# IDEA-0829 — The trader's AI agent helps author and audit bots, never executes

## Problem

The trader can already connect an AI agent to Cachy through settings.
Authoring a correct multi-condition bot is hard, reviewing a track record is
work, and a model is good at exactly those translations — and forbidden,
outright, from being part of the trading decision (ADR-0012: a strategy is
checkable data, not a model's opinion).

The product owner asked (2026-11-18) where a connected agent could genuinely
help. Four proposals, all strictly at authoring and analysis time:

## The four proposals

1. **Prose → bot draft.** The trader describes the setup ("buy when RSI is
   under 30 and ADX above 20, exit above 70"); the agent drafts the
   `RuleDocument`; the Rust core validates; the trader edits and confirms.
   This is FEAT-0817, extended to reach the agent through the existing
   settings integration.
2. **Pre-arm audit.** The agent reads the draft and warns in plain language:
   "a 0.5% stop does not fit 4h volatility", "condition 3 contradicts
   condition 1", "no exit rule defined". A co-pilot with no hands.
3. **Track-record analysis.** "Why did this bot lose?" — the agent
   summarizes journal data: which condition fired, where the stop caught,
   how entries distributed. Journal data is Class A: analysis stays local
   or user-directed egress (ADR-0018 territory; consent required).
4. **Template matching.** "Which curated template fits my description?" —
   the agent recommends from the FEAT-0818 library with citations, not
   vibes.

## The line that never moves

No confidence score gates an order, no model call sits in the evaluation
loop, no draft is armed by the same action that saved it. An agent that
cannot be trusted to trade is still perfectly useful to talk to.

## Links

- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`ADR-0018`](../../adr/0018-user-directed-egress-of-class-a-announcements.md)
- [`FEAT-0817`](../features/FEAT-0817-ai-assisted-rule-authoring.md)
- [`FEAT-0818`](../features/FEAT-0818-curated-literature-strategy-templates.md)
- Code: AI-agent settings integration in `src/stores/settings.svelte.ts`
