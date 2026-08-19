---
id: BUG-0244
title: Gemini/Gemma prompt leak guard uses fragile chunk length heuristic
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
estimate: 2
size: XS
start_date: 2026-08-18
target_date: 2026-08-18
---


# BUG-0244 — Gemini/Gemma prompt leak guard uses fragile chunk length heuristic

## Symptom

`ai.svelte.ts` contains a workaround that drops the very first streaming chunk from Gemini if it exceeds 600 characters, under the assumption that it must be an echoed system prompt. This heuristic is fragile and can drop valid model output or fail to catch leaks under 600 characters.

## Evidence

**Derived.** In `src/stores/ai.svelte.ts:581-585`:
```typescript
// Guard against Gemma/Gemini first-chunk system-prompt leak:
// If the very first delta is suspiciously long (>600 chars), it likely
// contains the system prompt echoed back. Skip rendering until next chunk.
if (isFirstChunk && provider === "gemini" && delta.length > 600) {
  isFirstChunk = false;
  fullContent += delta;
  continue; // Don't render this chunk to the user
}
```

## Cause

In `src/routes/api/ai/gemini/+server.ts`, for models matching `"gemma"`, the system prompt was prepended directly to the user message as `[System Instruction]\n...` instead of using proper system instructions or delimiter separation.

## Fix

1. In `src/routes/api/ai/gemini/+server.ts`:
   - Use the native `systemInstruction` field for all standard Gemini models.
   - For models requiring user-message wrapping, enforce clear delimiters and formatting that prevent prompt echo.
2. Remove the fragile `delta.length > 600` heuristic in `src/stores/ai.svelte.ts`.

## Acceptance criteria

- [ ] Fragile `delta.length > 600` check is removed from streaming reader.
- [ ] Gemini models correctly utilize the `systemInstruction` payload structure.
- [ ] No system prompt leakage occurs during streaming responses.

## Out of scope

- Upstream Gemma model tokenization behavior.

## Open questions

- None.

## Links

- Epic: [`FEAT-0239`](../features/FEAT-0239-epic-ai-prompt-architecture.md)
- GitHub Issue: #2072
