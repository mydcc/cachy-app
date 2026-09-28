---
id: BUG-0572
title: A native float seeds price-alert rules before decimal.js sees it
type: bug
status: done
assignee: opencode
branch: fix/bug-0572-alert-seed-float
shipped: unreleased
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: [BUG-0534]
---

# BUG-0572 — A native float seeds price-alert rules before decimal.js sees it

Found while reviewing BUG-0534 (PR #3685): the sweep of every native-number
conversion in every `.svelte` component turned up exactly one line that reaches
the alert engine, and it is marked `audit: safe` under a reason that has since
been corrected. This item exists so the judgement is made on purpose.

## Symptom

`src/lib/windows/implementations/CandleChartView.svelte:188` converts a kline
close to a native number:

```ts
const close = Number(last.close);
```

`lastChartPrice()` feeds two alert paths:

- `armDrawingAlert({ …, currentPrice: new Decimal(price) })`
- `conditionFromChartClick({ clickedPrice: menu.price, lastPrice: lastChartPrice() })`

`conditionFromChartClick` (`src/lib/alerts/chartAlertSeed.ts:114,122`) does
`new Decimal(input.clickedPrice).toDecimalPlaces(decimals, ROUND_HALF_UP)` — the
`Decimal` is constructed **from the already-lossy f64**, so the precision is
gone before `decimal.js` is involved. Rounding to axis precision afterwards is
deliberate (`chartAlertSeed.ts:100-104`), which is what makes this arguable
rather than clearly wrong.

## Why it is not obviously a bug

An alert notifies; it does not place an order. Nothing here moves money, and
the seed is rounded to the axis precision the user is looking at. So the current
behaviour may well be correct.

## Why it is still worth deciding

It is the only line in the whole component sweep where a native number reaches
financial logic, it is the closest thing to a real violation that the audit
found, and a `Decimal` built from a lossy float is a pattern that is easy to
copy into a path that *does* place an order. Whether the seed should be a
`Decimal` end to end is a judgement about the alert engine, not about the audit.

## Fix

Decide, then write the decision down:

1. **Keep the float, document the boundary.** Say in the code that the chart
   works in f64 by design and that the alert seed is re-wrapped and rounded
   there. Cheapest, and defensible if axis precision is the intended contract.
2. **Make `lastChartPrice()` a `Decimal`.** The chart's own series keep their
   f64 (the library's API), but the value handed to the alert engine is
   re-wrapped from the string form, so no precision is lost in transit. Costs a
   conversion at the boundary and needs the chart click path re-checked.

Then make the `audit: safe` reason on that line match the decision, so the next
reader of the marker learns the outcome rather than the question.

## Acceptance criteria

- [x] The decision is written in the code at the conversion, and the marker's
      reason matches it
- [x] Either `lastChartPrice()` returns a `Decimal` to its callers, or the
      rounding contract at `chartAlertSeed.ts` is documented as the boundary
- [x] The alert path is covered by a test that would fail if the seed lost
      precision a caller could observe

## What shipped

Option 1, as decided: keep the float, document the boundary.

`lastChartPrice()` carries the decision comment — the chart works in f64 by
design, and neither alert consumer needs more. The marker reason was rewritten
to match: re-round in `chartAlertSeed.ts`, direction-only comparison in
`createDrawingAlert.ts`. The rounding contract in `conditionFromChartClick`
now names itself as the precision boundary: callers pass f64, the re-wrap
plus `ROUND_HALF_UP` to axis decimals pins the stored level exact at the
precision the trader read off the scale.

Reading the second consumer confirmed the decision rather than complicating
it: `buildDrawingAlert` uses `currentPrice` only to pick a side (`eq`/`lt`
against the drawing's own level) — the stored `right.value` is
`level.toString()` from the drawing geometry, so that float never reaches a
document either. Its request interface already said "decides the direction",
so no change was needed there.

The boundary is pinned by two tests: `0.1 + 0.2` seeds `"0.3"` at two axis
decimals (without the rounding the document would carry
`"0.30000000000000004"`, verified by direct `Decimal` evaluation), and the
stored level is identical whether `lastPrice` carries dust or not. 12/12
seed tests green, real audit over `src/` clean.

## Out of scope

- Converting the chart's own series data to `Decimal`; the chart library's API
  is number-based, and 24 lines in that file are exempt for that reason.
- The other 66 marked conversions, none of which reaches financial logic.

## Links

- `src/lib/windows/implementations/CandleChartView.svelte:188`
- `src/lib/alerts/chartAlertSeed.ts`
- Found during the BUG-0534 review; that PR marked the line rather than
  changing it, deliberately
