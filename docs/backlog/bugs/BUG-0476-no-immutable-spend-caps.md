---
id: BUG-0476
title: No immutable spend caps independent of AI-influenced sizing inputs
type: bug
status: ready
priority: P1
milestone: M9
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0476 — No immutable spend caps independent of AI-influenced sizing inputs

## Symptom

Position sizing derives from `accountSize × risk% ÷ stop distance`, and all three inputs are writable by AI actions (`setAccountSize`, `setRisk`, plus entry/SL in `src/stores/ai.svelte.ts:1073-1114`). There is no hard per-order or per-day USD ceiling that survives a compromised or confused model: `maxPositionSizeUsdt` (default 5000, `src/services/rmsService.ts:123-127`) is user-configurable, and the risk-limit hook (`registerRiskLimitCheck`) enforces policy the same actor can reshape. Defense in depth requires a limit outside the model's reach.

## Evidence

**Derived.** Sizing inputs are AI-writable (see BUG-0471); `rmsService` limits live in the user-editable `riskState` store (`src/stores/riskLimits.svelte.ts`) with no immutable floor/ceiling layer. No `MAX_SINGLE_TX_USD` / `MAX_DAILY_SPEND_USD` constant exists anywhere in `src/services/`.

## Cause

Risk limits were designed as user policy, not as a backstop against a misbehaving input source — the AI action channel postdates that design.

## Fix

1. Add independent hard caps (per-order USD notional, daily USD notional) enforced in `orderGate`/`rmsService`, not bypassable via trade-state values.
2. Defaults conservative (e.g. per-order ≤ account-derived sanity bound); user may raise them only through an explicit, confirmed settings change — never via AI action.
3. Refusals use the existing `riskLimit` vocabulary so UI/i18n need no new concepts.
4. Tests: oversized intent refused even when accountSize/risk% claim it is fine.

## Acceptance criteria

- [ ] An order exceeding the hard cap is refused regardless of accountSize/risk% inputs (test fails without the fix)
- [ ] Caps are not writable through any AI action
- [ ] Daily spend accumulates across live orders and resets on a stated UTC boundary (same convention as the daily-loss window)

## Out of scope

- Paper-trading caps (paper needs no capital protection; keep it uncapped)
- Exchange-side leverage caps (venue concern, already capability-checked)

## Open questions

- None.

## Links

- Audit: LLM Trading Agent Security (2026-09-14), checklist item 2
- Related: [`BUG-0471`](BUG-0471-ai-actions-auto-apply-by-default.md), [`FEAT-0013`](../features/FEAT-0013-risk-limits-and-kill-switch.md)
