---
id: BUG-0603
title: TP/SL and pending-order chart line titles stay English in German
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: i18n
data_class: none
adr: none
depends_on: []
---

# BUG-0603 — TP/SL and pending-order chart line titles stay English in German

## Symptom

On the candlestick chart, the take-profit, stop-loss and resting-limit-order
price lines are labelled with English text regardless of the selected locale:
`TP`, `SL: 62000.00 (+1.20% / +200.00)`, `Buy Limit: 61000.00`. The position
lines next to them (Entry, Liq., B/E) were localized by the companion work on
`chart.lines.*`, so a German user sees a half-translated chart: the line next
to `SL` says `Liq.`, and the line above it says `SL`.

## Evidence

**Derived, from reading the code**

`src/services/chart/priceLineManager.ts` builds these titles from string
literals and template literals rather than from a host-supplied label, while
the position lines in the same method read `input.labels.*`:

- `update()` — `const tpTitle = … : "TP";` and the `` `TP: ${…} (${…})` `` /
  `` `SL: ${…} (${…})` `` templates built from `formatDistance(...)`
- `syncPendingOrders()` — `` `TP: ${order.price.toFixed()}` ``,
  `` `SL: ${order.price.toFixed()}` `` and
  `` `${order.side === "buy" ? "Buy" : "Sell"} Limit: ${order.price.toFixed()}` ``

`src/lib/windows/implementations/CandleChartView.svelte` passes the resolved
`chart.lines.*` translations into `priceLineManager.update()`, so the manager
already receives localized strings — the same channel exists for these titles,
it is just not populated.

Why `scripts/lint-i18n.js` does not catch it: the `object-label` rule only
matches quoted literals assigned to a `label:` / `title:` / `description:`
property. These five are bare assignments and interpolating template literals,
so no allowlist entry exists and nothing is reported.

## Cause

`PriceLineUpdateInput.labels` was introduced for the three position lines only.
The TP/SL and pending-order titles were left as literals in the service,
inheriting the pre-existing "no Svelte imports in this module" constraint
without being routed through the host the way the position lines are.

## Fix

Extend the label channel already present in `PriceLineUpdateInput` — do not
import `svelte-i18n` into the service. Add the remaining label strings
(`takeProfit`, `stopLoss`, `buyLimit`, `sellLimit`) to the object the host
supplies, resolve them in `CandleChartView.svelte`, and format them in
`syncPendingOrders()` / `update()` with `formatDistance(...)` kept as-is.

Keep `TP` / `SL` as abbreviations in the German dictionary unless the label box
is measured to be too narrow: those are the forms German trading front-ends
display, and lengthening them widens an already-overlapping label box next to
the (nearly coincident) Entry and Break-Even lines.

## Acceptance criteria

- [ ] A test fails without the fix: with the host passing German labels, the
      titles of the TP/SL and pending-order lines are still English
- [ ] The test passes with the fix
- [ ] No regression in the distance format (`+1.20% / +200.00`) or in the
      price text itself
- [ ] The bare `"TP"` / `"SL"` literals are gone from the service

## Links
