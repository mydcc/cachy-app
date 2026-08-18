---
id: BUG-0243
title: Risk:Reward Guard only logs but does not block execution
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

# BUG-0243 — Risk:Reward Guard only logs but does not block execution

## Symptom
With a bad Risk:Reward ratio, a warning is logged but the action executes anyway. If `confirmActions=false` is set, there's no safety brake against unwanted automatic executions.

## Evidence
**Derived**: `src/stores/ai.svelte.ts:611-627` shows it logs a warning but proceeds.

## Cause
Implemented as "Trader Autonomy Mode" without a hard stop for automatic executions.

## Fix
Implement a strict block or require explicit confirmation for bad R:R ratios when `confirmActions` is false.

## Acceptance criteria
- [ ] Bad R:R actions are blocked or strictly require confirmation even in auto-mode.
