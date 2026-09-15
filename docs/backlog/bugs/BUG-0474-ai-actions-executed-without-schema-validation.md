---
id: BUG-0474
title: Parsed AI actions are executed without schema validation
type: bug
status: in-progress
assignee: opencode
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
size: S
---

# BUG-0474 — Parsed AI actions are executed without schema validation

## Symptom

Whatever JSON the model emits in a ` ```json ` block (or tool-call buffer) is
`JSON.parse`d, cast to `AiAction[]`, and handed to `executeAction` with no
check against the declared tool schema. Unknown action names fall through
silently, wrong value types flow into lenient parsers, and `setSymbol`
accepts any string. Behaviour on malformed model output is accidental rather
than specified.

## Evidence

**Derived** from reading the code (not observed live).

- `src/stores/ai.svelte.ts:1076-1102` (`parseActions`): regex + `JSON.parse`
  + `as AiAction[]`, no validation.
- `src/stores/ai.svelte.ts:585-595`: tool-call buffer path only checks
  `Array.isArray`.
- `src/stores/ai.svelte.ts:1104-1244` (`executeAction`): per-case type checks
  exist, but there is no allow-list of action names and no value-shape check
  up front; `setSymbol` (`:1155-1159`) assigns any string to
  `tradeState.symbol`.

## Cause

The `execute_trade_actions` parameter schema in
`src/lib/ai/prompts/actionSchema.ts` is only ever shown to the model — the
app never enforces it on the way back in. Parsing and validation are the same
unvalidated step.

## Fix

- Add a pure `validateAiAction()` (next to `parseActions`): action name must
  be in the declared enum; values checked per action (number-like for
  prices/leverage/risk/percent, boolean for flags, `long|short` /
  `auto|manual` where the switch already enforces them); `setSymbol`
  restricted to a safe pattern (uppercase alphanumerics, bounded length).
- Invalid actions are dropped with a `logger.warn("ai", …)` before execution,
  in both the regex path and the tool-buffer path.

Leave alone: the action set, the confirmation UX (see BUG-0472), the R:R
guard.

## Acceptance criteria

- [ ] A test reproduces the defect (an unknown action name, and a
      `setLeverage` with a non-numeric value, reach `executeAction` today)
      and fails without the fix
- [ ] With the fix, both are dropped with a warning and valid actions still
      execute
- [ ] `setSymbol` rejects strings outside the safe pattern in a unit test

## Out of scope

- Adding or removing supported actions
- Confirmation flow and defaults (see BUG-0472)
- News/context hardening (see BUG-0473)

## Links

- `src/stores/ai.svelte.ts` (`parseActions`, tool-buffer handling, `executeAction`)
- `src/lib/ai/prompts/actionSchema.ts` (the schema to enforce)
- `src/utils/utils.ts` (`parseAiValue` leniency the validator must sit in front of)

## Claim

- Branch: `fix/bug-0474-3318`
- Assignee: `opencode` (issue #3318)
