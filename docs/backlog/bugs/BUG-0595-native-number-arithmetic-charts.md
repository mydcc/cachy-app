---
id: BUG-0595
title: Native number arithmetic used for financial values in charts.ts
type: bug
status: done
assignee: opencode
branch: fix/bug-0595-decimal-charts
priority: P1
milestone: none
editions: [community, pro, private]
area: core
data_class: none
adr: none
depends_on: []
---

# BUG-0595 — Native number arithmetic used for financial values in charts.ts

## Symptom

Financial values (like PNL, risk amount, drawdown, profit factor, etc.) are converted to native `number` types. Native IEEE-754 `number` arithmetic is lossy for financial values and prohibited outside of read-only UI display boundaries (like canvas charts) to prevent precision artifacts.

## Evidence

**Derived**, from reading the code.

The file `src/lib/calculators/charts.ts` uses `.toNumber()` on financial `Decimal` values in numerous places:
- `src/lib/calculators/charts.ts`: Line 47 (`return { x: t.date, y: new Decimal(cumulative).toNumber() };`)
- `src/lib/calculators/charts.ts`: Line 59 (`return { x: t.date, y: new Decimal(currentDrawdown).toNumber() };`)
- `src/lib/calculators/charts.ts`: Line 75 (`const monthlyData = monthlyLabels.map((k) => new Decimal(monthlyStats[k]).toNumber());`)
- `src/lib/calculators/charts.ts`: Line 165 (`const rVal = rDec.toNumber();`)
- `src/lib/calculators/charts.ts`: Line 177 (`cumulativeRCurve.push({ x: t.date, y: cumulativeR.toNumber() });`)
- `src/lib/calculators/charts.ts`: Line 209 (`profitFactor: new Decimal(profitFactor).toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 210 (`avgWin: new Decimal(avgWin).toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 211 (`avgLoss: new Decimal(avgLoss).toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 212 (`expectancy: new Decimal(expectancy).toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 255 (`b[1].minus(a[1]).toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 280 (`longCurve.push({ x: t.date, y: new Decimal(cumLong).toNumber() });`)
- `src/lib/calculators/charts.ts`: Line 281 (`shortCurve.push({ x: t.date, y: new Decimal(cumShort).toNumber() });`)
- `src/lib/calculators/charts.ts`: Line 285 (`longPnl: new Decimal(longPnl).toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 286 (`shortPnl: new Decimal(shortPnl).toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 289 (`data: topSymbols.map((s) => new Decimal(s[1]).toNumber()),`)
- `src/lib/calculators/charts.ts`: Line 293 (`data: bottomSymbols.map((s) => new Decimal(s[1]).toNumber()),`)
- `src/lib/calculators/charts.ts`: Line 333 (`return { x: t.date, y: new Decimal(cumFees).toNumber() };`)
- `src/lib/calculators/charts.ts`: Line 345 (`gross: new Decimal(totalGross).toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 346 (`net: new Decimal(totalNet).toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 349 (`trading: new Decimal(sumTrading).toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 350 (`funding: new Decimal(sumFunding).toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 386 (`y: new Decimal(pnl).toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 431 (`y: s.pnl.toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 454 (`x: t.riskAmount.toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 455 (`y: new Decimal(pnl).toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 492 (`const lev = t.leverage ? t.leverage.toNumber() : 1;`)
- `src/lib/calculators/charts.ts`: Line 594 (`cumulative += getTradePnL(t).toNumber();`)
- `src/lib/calculators/charts.ts`: Line 649 (`pnl: h.pnl.toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 666 (`const pnlDistribution = closedTrades.map((t) => getTradePnL(t).toNumber());`)
- `src/lib/calculators/charts.ts`: Line 731 (`const mfe = new Decimal(t.mfe).toNumber();`)
- `src/lib/calculators/charts.ts`: Line 732 (`const mae = new Decimal(t.mae).toNumber();`)
- `src/lib/calculators/charts.ts`: Line 733 (`const pnl = new Decimal(getTradePnL(t)).toNumber();`)
- `src/lib/calculators/charts.ts`: Line 734 (`const risk = new Decimal(t.riskAmount || 0).toNumber();`)
- `src/lib/calculators/charts.ts`: Line 766 (`const winRate = stats.winRate.toNumber(); // 0-100`)
- `src/lib/calculators/charts.ts`: Line 769 (`const pf = stats.profitFactor.isFinite() ? stats.profitFactor.toNumber() : 10;`)
- `src/lib/calculators/charts.ts`: Line 782 (`const rf = perf?.recoveryFactor.toNumber() || 0;`)
- `src/lib/calculators/charts.ts`: Line 787 (`const avgWin = perf?.avgWin.toNumber() || 0;`)
- `src/lib/calculators/charts.ts`: Line 788 (`const avgLoss = perf?.avgLossOnly.toNumber() || 1; // Avoid div 0`)
- `src/lib/calculators/charts.ts`: Line 795 (`const avgR = perf?.avgRMultiple.toNumber() || 0;`)
- `src/lib/calculators/charts.ts`: Line 832 (`const atrs = tradesWithAtr.map((t) => t.atrValue!.toNumber());`)
- `src/lib/calculators/charts.ts`: Line 843 (`const val = t.atrValue!.toNumber();`)
- `src/lib/calculators/charts.ts`: Line 857 (`pnl: buckets[k].pnl.toNumber(),`)
- `src/lib/calculators/charts.ts`: Line 885 (`rMultiples.push(getTradePnL(t).div(t.riskAmount).toNumber());`)

*(Note: While these outputs are eventually consumed by charting libraries, the calculator itself should ideally output strictly defined interfaces holding `Decimal` types, deferring the lossy `toNumber()` conversion to the immediate edge where the chart is rendered. Currently, business and chart presentation logic seem somewhat intermixed, leading to early loss of precision in intermediate structures.)*

## Cause

The charts calculator file transforms domain `Decimal` objects into native JavaScript numbers well before the actual chart drawing edge, polluting intermediate data structures with lossy types.

## Fix

Change the return types of these structures to contain `Decimal` instances (or strings) for financial fields. Downstream UI logic must handle these correctly (e.g., extracting values specifically for display charts only at the very edge of the rendering tree). If the data structures are designed specifically and only for the charting library, consider renaming them or verifying if this conversion violates the broader strict architectural rule.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix
- [x] The test passes with the fix
- [x] No `toNumber()` or other native number conversions are used for financial calculations/comparisons in this file
  (remaining `.toNumber()` calls are chart-point edges, dimensionless ratios,
  indicator math or display scores — each with an audit comment citing ADR-0021)
