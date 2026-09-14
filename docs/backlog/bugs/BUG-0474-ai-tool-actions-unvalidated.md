---
id: BUG-0474
title: AI tool-call actions accepted without schema validation
type: bug
status: ready
priority: P1
milestone: M9
editions: [community, pro, private]
area: ai
data_class: A
adr: none
depends_on: []
---

# BUG-0474 — AI tool-call actions accepted without schema validation

## Symptom

A structured tool call from the model is accepted whenever it contains an array under `actions` — action names are never checked against the allow-list, value types are never validated, and unknown actions report success. A model emitting a hallucinated or injected action name silently "succeeds" instead of being refused and logged.

## Evidence

**Derived.** `src/stores/ai.svelte.ts:547-557`:

```typescript
if (this._toolCallBuffer) {
   try {
     const parsedTool = JSON.parse(this._toolCallBuffer);
     if (parsedTool.actions && Array.isArray(parsedTool.actions)) {
         actions = parsedTool.actions;
     }
```

No check against the `execute_trade_actions` enum defined in `src/lib/ai/prompts/actionSchema.ts:40-46`. And `executeAction` (`src/stores/ai.svelte.ts:1066-1206`) has no `default` case: unknown names fall through the switch and still `return true`.

## Cause

The tool-call path was added as a second parser beside the regex path without reusing the schema the tool itself declares.

## Fix

1. Validate parsed tool calls with a Zod schema mirroring `executeTradeActionsTool`: known `action` enum, correct value/index/percent types; drop (and warn-log) unknown or malformed entries.
2. Make `executeAction` return `false` for unknown actions and log them.
3. Share one allow-list between `actionSchema.ts` and the validator so they cannot drift.
4. Tests: unknown action → refused + logged; malformed tool JSON → falls back to regex path, mutates nothing.

## Acceptance criteria

- [ ] Unknown or malformed actions never mutate trade state and are warn-logged (tests fail without the fix)
- [ ] All 19 documented actions still execute with valid payloads
- [ ] Schema and tool declaration share a single source of truth

## Out of scope

- Changing the supported action set itself
- Server-side tool-call filtering

## Open questions

- None.

## Links

- Audit: LLM Trading Agent Security (2026-09-14), finding 4
- Related: [`BUG-0006`](BUG-0006-sentiment-response-unvalidated.md) (same unvalidated-response family)
