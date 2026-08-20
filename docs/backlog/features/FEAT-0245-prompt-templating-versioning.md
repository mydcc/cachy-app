---
id: FEAT-0245
title: Centralize prompt templating and versioning
type: feature
status: done
priority: P1
milestone: M8
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
parent: FEAT-0239
estimate: 3
size: S
start_date: 2026-08-18
target_date: 2026-08-18
---


# FEAT-0245 — Centralize prompt templating and versioning

## Problem

The entire system prompt (>250 lines) is currently constructed inline within the `sendMessage()` method in `src/stores/ai.svelte.ts`. This monolithic inline template mixes persona definition, language instructions, mode overrides, price classification rules, technical indicator formatting, temporal grounding, and JSON action schemas in one file.

There is no prompt versioning, modularity, or snapshot testing, making changes risky and regressions difficult to detect.

## Proposal

1. Extract prompt modules into `src/lib/ai/prompts/`:
   - `baseRole.ts`: Core trading expert persona, constraints, and audit-first protocol.
   - `safetyRules.ts`: Anti-hallucination, exact string formatting for numbers, temporal anchors.
   - `actionSchema.ts`: Tool/action schemas and definitions.
   - `contextFormatter.ts`: Sanitization and serialization of real-time market context.
2. Implement a centralized `buildSystemPrompt()` function with deterministic ordering.
3. Add snapshot and unit tests in `src/tests/ai/prompts.test.ts` to lock in prompt behavior and prevent regression during refactors.

## Acceptance criteria

- [ ] Prompts are cleanly extracted from `src/stores/ai.svelte.ts` into dedicated modular files.
- [ ] Snapshot tests cover prompt generation for all analysis modes (`risk`, `coach`, `scalper`, `analyst`) and configurations.
- [ ] `src/stores/ai.svelte.ts` line count is substantially reduced and delegates prompt construction to the prompt builder.

## Out of scope

- Runtime A/B testing infrastructure.

## Open questions

- None.

## Links

- Epic: [`FEAT-0239`](FEAT-0239-epic-ai-prompt-architecture.md)
- GitHub Issue: #2077
