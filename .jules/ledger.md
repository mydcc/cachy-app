# Ledger Audit

**Coverage Date:** 2026-10-25

## Subsystem Audited

Derived Data: `src/services/mdaService.ts`

## Coverage

Derived coverage from `docs/backlog/INDEX.md` and `git log -- docs/backlog/`.

## Learnings

- `mdaService.normalizeKlines` had an unprotected numeric conversion of kline timestamps where `Number(undefined)` evaluated to `NaN` if the original object lacked a timestamp.
- We need to be careful with `parseFloat` and `Number` calls where missing attributes can propagate `NaN` into calculations downstream (like technical indicators and charts).

## Action

Created BUG-0250 for `mdaService.normalizeKlines` producing `NaN` timestamps.
