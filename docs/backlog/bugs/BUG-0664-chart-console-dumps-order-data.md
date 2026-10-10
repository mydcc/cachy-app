---
id: BUG-0664
title: CandleChartView dumps order ids and bracket prices to console on every tick
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: chart
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0664 — CandleChartView dumps order ids and bracket prices to console on every tick

## Symptom

For every resting limit order on the symbol, on every chart effect run,
`orderId`, `symbol`, `type`, `status`, `tpPrice` and `slPrice` are
written to the console — even when the user turned API logging off or
never enabled debug mode. Console output is routinely pasted into
public bug reports, carrying order identifiers and bracket levels with
it.

## Evidence

**Derived** from code reading.

- `src/lib/windows/implementations/CandleChartView.svelte:1363-1376` —
  raw `console.debug("[CandleChartView] FEAT-0247: pending orders for
  symbol", matchingOrders.map(o => ({ orderId, symbol, type, status,
  tpPrice, slPrice })))`.
- Contrast the gated path, `logger.ts:106-109` — `logger.debug`
  applies the `import.meta.env.DEV` gate — and the `api` category,
  which is off by default (`settingsTypes.ts:765-772`). This call
  honours neither.

## Cause

A leftover FEAT-0247 diagnostic written through `console` instead of
`logger`; the symptom it documents is long understood.

## Fix

Route it through `logger.debug("api", …)` so it inherits the settings
and DEV gates, or delete it — the diagnostic has served its purpose.

**Done (opencode).** Routed through `logger.debug("api", …)`. The
diagnostic itself is kept — it is still the only way to tell "the fields
never arrived from the exchange" from "they arrived and something here
drops them" — but it now sits behind both the DEV gate and the `api`
category, which is off by default. Two tests in
`CandleChartView.component.test.ts` pin the pair: nothing reaches the
console with the category off, and the diagnostic still reports the
bracket when it is on, so "delete it" cannot pass silently.

## Acceptance criteria

- [x] No raw `console.*` call emits order data on chart ticks
- [x] With API logging off, the console carries no order identifiers
      or bracket levels from the chart

## Links

- FEAT-0247 (the diagnostic's origin)
