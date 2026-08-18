---
id: BUG-0241
title: customSystemPrompt completely overwrites baseRoleInstructions and safety rules
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
parent: FEAT-0239
---

# BUG-0241 — customSystemPrompt completely overwrites baseRoleInstructions and safety rules

## Symptom
When a user sets a custom system prompt, all safety rules (Anti-Hallucination, R:R-Audit, Number format rules) are lost because `settings.customSystemPrompt || baseRoleInstructions` completely replaces the base instructions.

## Evidence
**Derived**: Read `src/stores/ai.svelte.ts:351`. The `||` operator replaces the entire block.

## Cause
The logic explicitly replaces instead of combining.

## Fix
Change the model to be additive: the Custom Prompt is appended or integrated, but the critical safety/core rules remain enforced.

## Acceptance criteria
- [ ] A custom prompt can be set without losing the anti-hallucination and formatting rules.
