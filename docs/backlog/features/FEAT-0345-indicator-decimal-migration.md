---
id: FEAT-0345
title: "Migrate indicator and charting variables to decimal.js"
type: feature
status: done
done_version: 1.6.0-beta.364
assignee: opencode
branch: feat/0345-indicator-decimal
priority: P2
milestone: none
editions: [community, pro, private]
area: calculation
adr: ADR-0021
data_class: none
adr: none
depends_on: []
parent: FEAT-0341
---

## Problem
`AGENTS.md` mandates the use of `decimal.js` for ALL prices, amounts, and balances, strictly forbidding native `number`. While core execution paths were migrated (`BUG-0183`), several indicator and chart-related modules still use `number` for financial metrics:
- `src/services/smc/types.ts` (`price`, OrderBlock `top`/`bottom`)
- `src/utils/statefulTechnicalsCalculator.ts`
- `src/services/chart/priceLineManager.ts`
- `src/utils/confluenceAnalyzer.ts`

## Fix
Refactor the aforementioned files and their associated interfaces to use `decimal.js` (or `Decimal` type). Ensure performance is not catastrophically impacted if these are passed in tight loops to rendering components, or document an ADR if `number` must be kept for webgl/canvas rendering boundaries.

## Resolution (2026-09-23, no code migration — see ADR-0021)

Per-file verdict while implementing:

- `src/services/chart/priceLineManager.ts` — already compliant: all money
  fields (`triggerPrice`, `entryPrice`, `liquidationPrice`, `breakEvenPrice`,
  `size`, `tickSize`) are `Decimal`; remaining `number`s are the Lightweight
  Charts API boundary.
- `src/utils/confluenceAnalyzer.ts` — holds no financial values (0–100
  sentiment score from signal counts); nothing to migrate.
- `src/utils/statefulTechnicalsCalculator.ts` — intentionally f64: BUG-0426
  display-only boundary with `toDisplayPrice()` conversion point + precision
  guard test. Migrating would break both.
- `src/services/smc/types.ts` — zone/candle math is comparison-only feeding
  analysis/charting via `aggregatorService`, never execution; Decimal would
  rewrite ~430 lines and ripple into the aggregator with zero precision
  benefit.

Resolved via the item's own escape hatch: ADR-0021 records the
money-vs-display boundary instead of migrating. Reopen with a demonstrated
precision defect if one ever appears.

## Acceptance criteria
- [ ] `price` and `amount` properties in the specified files use `Decimal`.
- [ ] No regression in charting performance.
- [ ] Existing indicator/math tests pass.

## Out of scope
- Refactoring `decimal.js` into WASM (this is covered by other backend tasks).
