---
id: BUG-0594
title: Native number arithmetic used for financial values in stats.ts
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: core
data_class: none
adr: none
depends_on: []
---

# BUG-0594 — Native number arithmetic used for financial values in stats.ts

## Symptom

Financial values (like PNL, net profit, gross profit, fees, risk amounts) are converted to native `number` types. Native IEEE-754 `number` arithmetic is lossy for financial values and prohibited outside of read-only UI display boundaries (like canvas charts) to prevent precision artifacts.

## Evidence

**Derived**, from reading the code.

The file `src/lib/calculators/stats.ts` uses `.toNumber()` on financial `Decimal` values in numerous places:
- `src/lib/calculators/stats.ts`: Line 377 (`new Decimal(tagStats[l].pnl || 0).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 465 (`pnl: new Decimal(data.pnl || 0).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 471 (`? new Decimal(data.bestSymbolPnl).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 505 (`rMultiple = pnl.div(riskAmount).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 565 (`pf = new Decimal(grossWin.div(grossLoss)).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 624 (`? new Decimal(totalNetProfit.div(totalGrossProfit).times(100)).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 628 (`? new Decimal(totalFees.div(totalGrossProfit).times(100)).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 632 (`grossProfit: new Decimal(totalGrossProfit).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 633 (`fees: new Decimal(totalFees.negated()).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 634 (`grossLoss: new Decimal(totalGrossLoss.negated()).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 635 (`netResult: new Decimal(totalNetProfit).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 666 (`totalFees: new Decimal(totalFees).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 734 (`const pnlData = buckets.map((b) => new Decimal(b.pnl || 0).toNumber())`)
- `src/lib/calculators/stats.ts`: Line 781 (`hourlyPnl: hourlyNetPnl.map((d) => new Decimal(d).toNumber())`)
- `src/lib/calculators/stats.ts`: Line 782 (`hourlyGrossProfit: hourlyGrossProfit.map((d) => new Decimal(d).toNumber())`)
- `src/lib/calculators/stats.ts`: Line 783 (`hourlyGrossLoss: hourlyGrossLoss.map((d) => new Decimal(d).toNumber())`)
- `src/lib/calculators/stats.ts`: Line 784 (`dayOfWeekPnl: reorder(dayNetPnl).map((d) => new Decimal(d).toNumber())`)
- `src/lib/calculators/stats.ts`: Line 786 (`new Decimal(d).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 789 (`new Decimal(d).toNumber()`)
- `src/lib/calculators/stats.ts`: Line 827 (`.map((t) => new Decimal(t.riskAmount!).toNumber())`)

## Cause

The statistics calculator processes `Decimal` instances but converts the final properties of its output structures to native JavaScript numbers, presumably for downstream consumption without strict typing or by charting components. However, this violates the precision rules for financial domains.

## Fix

Change the return types of these structures to contain `Decimal` instances (or strings) for financial fields. Downstream UI logic must handle these correctly (e.g., extracting values specifically for display charts only at the very edge of the rendering tree).

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix
- [ ] The test passes with the fix
- [ ] No `toNumber()` or other native number conversions are used for financial calculations/comparisons in this file
