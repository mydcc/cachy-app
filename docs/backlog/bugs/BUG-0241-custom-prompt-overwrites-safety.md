---
id: BUG-0241
title: customSystemPrompt completely overwrites baseRoleInstructions and safety rules
type: bug
status: done
priority: P1
milestone: M8
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
parent: FEAT-0239
estimate: 2
size: XS
start_date: 2026-08-18
target_date: 2026-08-18
---


# BUG-0241 — customSystemPrompt completely overwrites baseRoleInstructions and safety rules

## Symptom

When a user defines a custom system prompt in Settings (`settings.customSystemPrompt`), critical safety rules, output formatting constraints, and anti-hallucination protocols are wiped out. The AI may begin rounding decimal values, hallucinating levels, or ignoring execution formatting standards.

## Evidence

**Derived.** In `src/stores/ai.svelte.ts:351`:
```typescript
const systemPrompt = `${identity}\n\n${settings.customSystemPrompt || baseRoleInstructions}${modeOverride}`
```
When `settings.customSystemPrompt` is a non-empty string, the fallback `baseRoleInstructions` is completely bypassed.

## Cause

The store treats custom user instructions as a replacement for the entire system role rather than an additive layer.

## Fix

Refactor prompt assembly into an additive architecture:
1. **Core System Instructions (Immutable):** Identity, Anti-Hallucination rules, Exact String formatting for numbers, Audit-First Protocol, Action output schemas.
2. **User Personality / Custom Focus (Additive):** Appended under a dedicated `USER CUSTOM PREFERENCES / FOCUS:` section.
3. User prompts can tune tone, focus, or strategy, but can never disable safety constraints or number formatting rules.

## Acceptance criteria

- [ ] A custom prompt can be set without stripping anti-hallucination, R:R audit, or number formatting rules.
- [ ] Core constraints and action syntax rules are present in the final prompt regardless of user settings.
- [ ] Automated tests verify that core safety sections are preserved when `customSystemPrompt` is populated.

## Out of scope

- UI redesign of the custom system prompt input field in Settings.

## Open questions

- None.

## Links

- Epic: [`FEAT-0239`](../features/FEAT-0239-epic-ai-prompt-architecture.md)
- GitHub Issue: #2070

## What shipped

Shipped in merge main into develop for release 1.6.1.
