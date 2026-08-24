---
id: BUG-0246
title: Implicit coupling of empty string to standard behaviour in modeInstructions
type: bug
status: done
priority: P2
milestone: M8
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
parent: FEAT-0239
estimate: 1
size: XS
start_date: 2026-08-18
target_date: 2026-08-18
---


# BUG-0246 — Implicit coupling of empty string to standard behaviour in modeInstructions

## Symptom

In `src/stores/ai.svelte.ts`, `modeInstructions.risk` is defined as `""` (empty string) to represent the default "Risk Manager" mode. This relies on truthy/falsy checks and empty strings as magic values, making mode handling implicit and error-prone when adding or validating new modes.

## Evidence

**Derived.** In `src/stores/ai.svelte.ts:208-209`:
```typescript
const modeInstructions: Record<string, string> = {
  risk: "",  // Standard — baseRoleInstructions applies fully
  coach: [ ... ].join("\n"),
  scalper: [ ... ].join("\n"),
  analyst: [ ... ].join("\n"),
};
const modeOverride = modeInstructions[mode] ? `\n\n${modeInstructions[mode]}` : "";
```

## Cause

Using empty strings as sentinel values for default mode configuration instead of explicit typed definitions.

## Fix

1. Define a strict TypeScript union type `AiAnalysisMode = 'risk' | 'coach' | 'scalper' | 'analyst'`.
2. Provide explicit instruction builder functions or structured records for all modes without relying on empty strings.
3. Validate mode values against known modes with explicit fallback.

## Acceptance criteria

- [ ] `AiAnalysisMode` type is strictly defined and exported.
- [ ] All analysis modes have explicit instruction definitions without relying on magic empty strings.
- [ ] Fallback behavior for invalid modes is explicit and unit tested.

## Out of scope

- Adding new user-selectable analysis modes.

## Open questions

- None.

## Links

- Epic: [`FEAT-0239`](../features/FEAT-0239-epic-ai-prompt-architecture.md)
- GitHub Issue: #2073

## What shipped

Shipped in merge main into develop for release 1.6.1.
