---
id: FEAT-0239
title: Epic - AI Prompt Architecture & Safety Refactoring
type: feature
status: idea
priority: P2
milestone: none
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
---

# FEAT-0239 — Epic: AI Prompt Architecture & Safety Refactoring

## Problem
The current AI integration in `src/stores/ai.svelte.ts` suffers from structural issues: High token consumption due to un-cached inline prompts, safety rules being overwritten by custom system prompts, fragile regex-based JSON parsing instead of structured outputs, non-blocking risk/reward guards, heuristic leak-workarounds for Gemini/Gemma, lack of prompt versioning, and implicit coupling in mode configurations.

## Proposal
Decompose the AI module improvements into smaller items to establish a robust, cost-effective, and safe AI prompt architecture.

## Acceptance criteria
- [ ] All sub-items are completed.

## Out of scope
- Adding new AI models.

## Open questions
- None.

## Links
- [FEAT-0240](FEAT-0240-prompt-caching.md)
- [BUG-0241](../bugs/BUG-0241-custom-prompt-overwrites-safety.md)
- [FEAT-0242](FEAT-0242-structured-function-calling.md)
- [BUG-0243](../bugs/BUG-0243-risk-reward-guard-non-blocking.md)
- [BUG-0244](../bugs/BUG-0244-fragile-prompt-leak-workaround.md)
- [FEAT-0245](FEAT-0245-prompt-templating-versioning.md)
- [BUG-0246](../bugs/BUG-0246-implicit-analysis-mode-coupling.md)
