---
id: FEAT-0345
title: "Migrate indicator and charting variables to decimal.js"
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: calculation
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

## Acceptance criteria
- [ ] `price` and `amount` properties in the specified files use `Decimal`.
- [ ] No regression in charting performance.
- [ ] Existing indicator/math tests pass.

## Out of scope
- Refactoring `decimal.js` into WASM (this is covered by other backend tasks).
