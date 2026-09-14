---
id: BUG-0478
title: No hourly-loss or consecutive-loss circuit breaker
type: bug
status: ready
priority: P2
milestone: M9
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0478 — No hourly-loss or consecutive-loss circuit breaker

## Symptom

The kill switch and daily-loss limit (`src/services/rmsService.ts`, `FEAT-0013`) are the only automatic halts. Nothing stops a fast intraday bleed: three consecutive stopped-out trades in twenty minutes, or a −4% hour, keep trading until the daily boundary is hit. An AI-assisted loop (or a tilted trader clicking through confirmations) can do a day's damage in an hour.

## Evidence

**Derived.** `rmsService.ts` implements daily-loss (UTC window) plus kill switch; `orderGate.ts:595-604` consults only the registered kill-switch hook. No hourly-PnL check, no consecutive-loss counter exists in `src/services/`. The journal (`journalState.entries`, closed statuses `Won`/`Lost`) already carries everything needed to compute both.

## Cause

Breakers were specified per-day; sub-day granularity was never requested.

## Fix

1. Add two RMS limits beside daily-loss: max hourly loss % (default e.g. 3%) and max consecutive closed losses (default e.g. 3), both tripping the existing kill-switch path so no new refusal vocabulary is needed.
2. Compute from closed journal entries only (same `CLOSED_STATUSES` convention as daily-loss); unmeasurable state fails closed with the existing `riskLimitUnmeasurable` refusal.
3. Surface trip + reset time in the risk UI next to the daily counter.
4. Tests: third consecutive loss refuses the next open; −X% hour refuses; recovery after reset passes.

## Acceptance criteria

- [ ] Three consecutive closed losses halt new opens until reset (test fails without the fix)
- [ ] An hourly loss beyond the bound halts new opens until the next hour (test fails without the fix)
- [ ] Reduce-only closes and cancels are never blocked (same exemption as the kill switch)

## Out of scope

- Changing the daily-loss window or kill-switch semantics
- Automatic position flattening on trip (halt new risk only)

## Open questions

- None.

## Links

- Audit: LLM Trading Agent Security (2026-09-14), checklist item 5
- Related: [`FEAT-0013`](../features/FEAT-0013-risk-limits-and-kill-switch.md)
