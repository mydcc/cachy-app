---
id: BUG-0244
title: Gemini/Gemma prompt leak guard uses fragile chunk length heuristic
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

# BUG-0244 — Gemini/Gemma prompt leak guard uses fragile chunk length heuristic

## Symptom
The prompt leak guard relies on a heuristic checking if the first chunk is > 600 characters.

## Evidence
**Derived**: `src/stores/ai.svelte.ts:578-586`.

## Cause
A symptom-fix rather than addressing the root cause via API fields.

## Fix
Use the `system_instruction` field in the Gemini API instead of sending the System-Message in the chat array.

## Acceptance criteria
- [ ] Gemini API uses the native `system_instruction` field.
