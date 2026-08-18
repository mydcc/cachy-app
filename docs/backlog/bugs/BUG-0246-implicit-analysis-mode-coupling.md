---
id: BUG-0246
title: Implicit coupling of empty string to standard behaviour in modeInstructions
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
parent: FEAT-0239
---

# BUG-0246 — Implicit coupling of empty string to standard behaviour in modeInstructions

## Symptom
`modeInstructions.risk` uses an empty string to mean "Standard — baseRoleInstructions applies fully". This implicit coupling is poorly documented and error-prone.

## Evidence
**Derived**: `src/stores/ai.svelte.ts:209`.

## Cause
Using an empty string as a magic value.

## Fix
Refactor to use explicit mode flags or well-defined constants instead of empty strings.

## Acceptance criteria
- [ ] Mode instructions use explicit values instead of relying on empty strings for standard behaviour.
