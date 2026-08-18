---
id: FEAT-0240
title: Implement prompt caching for base role instructions
type: feature
status: done
priority: P2
milestone: M8
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
parent: FEAT-0239
estimate: 3
size: S
---

# FEAT-0240 — Implement prompt caching for base role instructions

## Problem

The `baseRoleInstructions` block in `src/stores/ai.svelte.ts` is over 100 lines long and contains detailed expert knowledge, format specifications, and negative constraints. Currently, this entire static text is concatenated into the system prompt and transmitted in full on every message alongside real-time market data.

This inflates token consumption, increases per-request latency, and causes unnecessary API expenses on every interaction.

## Proposal

Structure the system prompt payload to maximize provider prompt caching:
1. **Anthropic:** Mark the static system prompt block with cache breakpoints (`cache_control: { type: "ephemeral" }`).
2. **OpenAI / Gemini:** Separate the static invariant prompt prefix (role, safety rules, action formatting) from the volatile real-time context JSON so provider prefix caching naturally hits.
3. Ensure stable serialization order of static rules to prevent cache invalidation.

## Acceptance criteria

- [ ] Static base instructions are separated from dynamic context in request payloads.
- [ ] Anthropic requests include ephemeral prompt cache control markers where appropriate.
- [ ] Gemini/OpenAI payloads place static instructions before dynamic context to leverage automatic prefix caching.
- [ ] No regression in model response quality or streaming behavior.

## Out of scope

- Caching dynamic market data context across turns.
- Client-side response caching (already handled where appropriate).

## Open questions

- None.

## Links

- Epic: [`FEAT-0239`](FEAT-0239-epic-ai-prompt-architecture.md)
- GitHub Issue: #2075
