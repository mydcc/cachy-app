---
id: BUG-0243
title: Risk:Reward Guard only logs but does not block execution
type: bug
status: done
priority: P1
milestone: M8
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
parent: FEAT-0239
estimate: 2
size: XS
start_date: 2026-08-18
target_date: 2026-08-18
---


# BUG-0243 — Risk:Reward Guard only logs but does not block execution

## Symptom

When the AI proposes a trade setup with a mathematically poor Risk:Reward ratio (< 1.5), the guard logs a warning under the comment "Trader Autonomy Mode", but proceeds to apply and execute the trading parameters anyway. If `settings.aiConfirmActions` is `false`, bad setups are automatically applied without user confirmation.

## Evidence

**Derived.** In `src/stores/ai.svelte.ts:618-623`:
```typescript
if (!risk.isZero() && reward.div(risk).lt(1.5)) {
  // Low R:R detected — log warning for audit, but do NOT strip JSON block (Trader Autonomy)
  logger.warn("ai", "Low R:R setup generated (Trader Autonomy Mode)", {
    rr: reward.div(risk).toFixed(2),
  });
}
```
The execution continues immediately to apply all actions, ignoring the safety threshold.

## Cause

The implementation prioritized autonomous action execution over hard safety guarantees.

## Fix

Enforce a strict risk guard:
1. When calculated R:R is less than 1.5 (or mathematically invalid/inverted):
   - Do NOT automatically apply the action parameters if `aiConfirmActions` is `false`.
   - Downgrade the action to require explicit user review with a prominent warning badge (e.g. "Low R:R Setup (< 1.5): Manual Confirmation Required").
2. Ensure mathematical calculations strictly use `decimal.js`.

## Acceptance criteria

- [ ] Low R:R (< 1.5) setups are never auto-applied without explicit user confirmation.
- [ ] UI displays an unmistakable warning when an AI proposal fails the R:R threshold.
- [ ] Unit tests verify that poor R:R setups require confirmation regardless of `aiConfirmActions` setting.

## Out of scope

- Adjusting default risk calculation formulas in the core calculator.

## Open questions

- None.

## Links

- Epic: [`FEAT-0239`](../features/FEAT-0239-epic-ai-prompt-architecture.md)
- GitHub Issue: #2071
