---
id: BUG-0471
title: AI trade actions auto-apply without confirmation by default
type: bug
status: ready
priority: P0
milestone: M9
editions: [community, pro, private]
area: ai
data_class: A
adr: none
depends_on: []
---

# BUG-0471 — AI trade actions auto-apply without confirmation by default

## Symptom

With default settings the AI assistant writes directly into the live trade setup — entry, stop-loss, take-profits, leverage, risk percentage, account size, symbol — without asking. A user who then presses Place Order may execute a size they never reviewed. Only a low-R:R setup forces confirmation; every other mutation is silent.

## Evidence

**Derived.** `src/stores/settings.svelte.ts:648` defaults the guard to off:

```typescript
aiConfirmActions: false,
```

`src/stores/ai.svelte.ts:597-623` applies the whole batch immediately when the flag is off:

```typescript
const confirmActions = (settings.aiConfirmActions ?? false) || forceConfirm;
// ...
} else {
  // Execute immediately
  actions.forEach((action) => {
    if (!action) return;
    try {
      this.executeAction(action, false);
```

`executeAction` (`src/stores/ai.svelte.ts:1066-1206`) mutates Class A trade state: `setLeverage`, `setRisk`, `setAccountSize`, `setSymbol`, `setEntryPrice`, `setStopLoss`, `setTakeProfit`/`addTakeProfit`. No confirmation, no audit record.

## Cause

The confirmation gate exists but is opt-in; the default optimizes for demo smoothness over capital safety. Sibling of BUG-0243 (which fixed only the low-R:R case).

## Fix

1. Default `aiConfirmActions` to `true` for new installs; migrate existing `false` values only with an explicit user opt-out (do not silently flip a user's stored preference without a notice — pick one approach and state it in the PR).
2. At minimum, always require confirmation for capital-sizing actions (`setLeverage`, `setRisk`, `setAccountSize`, `setSymbol`) regardless of the flag — the same way low-R:R already forces confirmation.
3. Add unit tests: with default settings, an AI response containing actions lands in `pendingActions` and mutates nothing.

## Acceptance criteria

- [ ] Fresh installs require confirmation before any AI action mutates trade state
- [ ] `setLeverage`/`setRisk`/`setAccountSize`/`setSymbol` never auto-apply, independent of the flag
- [ ] Tests prove both statements and fail without the fix
- [ ] i18n strings exist in both DE and EN for any new UI copy

## Out of scope

- Changing the order gate or the Place Order confirmation path (FEAT-0011/FEAT-0024 stay untouched)
- Redesigning the pending-action UI beyond what the flag needs

## Open questions

- None.

## Links

- Audit: LLM Trading Agent Security (2026-09-14), findings 1 + checklist item 2
- Related: [`BUG-0243`](BUG-0243-risk-reward-guard-non-blocking.md), [`FEAT-0239`](../features/FEAT-0239-epic-ai-prompt-architecture.md)
