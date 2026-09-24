# ADR-0021: Decimal.js stays at money boundaries; display and analysis math stays f64

- **Status:** Proposed
- **Date:** 2026-09-23
- **Deciders:** opencode (builder, FEAT-0345) — acceptance pending human review

## Context

FEAT-0345 asked for `decimal.js` in four indicator/chart-adjacent modules.
Per-file findings (`develop` at FEAT-0538):

- `src/services/chart/priceLineManager.ts` — already Decimal for money
  (`triggerPrice`, `entryPrice`, `liquidationPrice`, `size`, `tickSize` are
  `Decimal`). The remaining `number`s are the Lightweight Charts API boundary
  (`price: number`, `priceToCoordinate`/`coordinateToPrice`), which cannot
  take Decimal.
- `src/utils/confluenceAnalyzer.ts` — holds no financial values at all; it
  aggregates a 0–100 sentiment score from signal counts. Nothing to migrate.
- `src/utils/statefulTechnicalsCalculator.ts` — explicitly a DISPLAY-ONLY
  f64 boundary (BUG-0426): indicator math runs on f64 for chart overlays,
  scores and thresholds, with a single `toDisplayPrice()` conversion point
  guarded by the precision guard test. Migrating it would break the guard
  test and the architecture behind it.
- `src/services/smc/types.ts` (+ `smcService.ts` math) — zone/candle math is
  comparison-only (`low <= top`, sweep activation) feeding analysis/charting
  via `aggregatorService`, never execution. Decimal would rewrite ~430 lines
  of comparisons into method calls and ripple into the aggregator, with zero
  precision benefit (comparisons do not accumulate rounding error).

The Decimal.js Enforcement CI already codifies this split: it audits files
that import `decimal.js` plus the legacy critical money files — none of the
four FEAT-0345 files are flagged.

## Decision

`decimal.js` remains mandatory for money (prices, amounts, balances in
calculator, risk, journal, and order paths). Display, charting, scoring, and
analysis-grade indicator math stays on native `number`, with explicit,
greppable conversion points (`toDisplayPrice()` and the chart-library API
boundary) where money becomes pixels.

## Consequences

### What this enables

- FEAT-0345 resolves without a high-risk rewrite of trading-adjacent math.
- Future "migrate X to Decimal" items can be triaged against this boundary
  instead of re-litigating it.

### What this costs

- Two numeric regimes coexist; reviewers must check that display values
  never flow back into money logic (the BUG-0426 guard test covers the
  technicals graph; the account-state write guard covers the money side).

### What is now forbidden

- Migrating display/analysis indicator math to Decimal for "consistency"
  without a demonstrated precision defect.
- Feeding f64 display values (technicals results, SMC zones, confluence
  scores) into calculator, risk, journal, or order logic.

## Alternatives considered

- **Migrate SMC math to Decimal**: rejected — comparison-only math gains no
  precision, rewrites ~430 lines, ripples into `aggregatorService`.
- **Migrate statefulTechnicalsCalculator internals**: rejected — contradicts
  the BUG-0426 display-only boundary and breaks its guard test.
- **Blanket Decimal everywhere including chart APIs**: rejected — the chart
  library API takes `number`; wrapping it would add conversions on every
  frame for no benefit.
