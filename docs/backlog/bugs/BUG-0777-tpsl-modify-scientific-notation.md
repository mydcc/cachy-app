---
id: BUG-0777
title: TP/SL modify serialises sub-micro prices in scientific notation
type: bug
status: in-progress
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
assignee: opencode
branch: fix/tpsl-modify-format
---

# BUG-0777 — TP/SL modify serialises sub-micro prices in scientific notation

## Symptom

Moving a take-profit or stop-loss line on the chart for a very cheap pair
(below `1e-6`) sends a trigger price in scientific notation (`1e-7`). The
venue rejects the body, while the chart has already moved the line
optimistically — so the trader sees a moved plan and then a refetch that puts
it back.

## Evidence

**Derived, with a failing test in the fix.** The chart hands over
`Decimal.toString()`:

- `src/lib/windows/implementations/CandleChartView.svelte:952` sends
  `triggerPrice: price.toString()`.
- `src/services/trade/tpSlService.ts:304-310` wrote `triggerPrice` and `qty`
  straight into the wire body.
- The create paths in the same module use `formatApiNum`
  (`:396`, `:400`, `:455`, `:459`, `:510-524`), and
  `src/services/trade/placeOrder.ts:122-124` documents that the venue rejects
  scientific notation.

Decimal.js `toString()` switches to exponential form at exponent `<= -7`, so
`new Decimal("0.0000001").toString()` is `"1e-7"`.

## Cause

`modifyTpSlOrder` was rewritten for the venue's per-leg body (BUG-0293) but
kept the raw `triggerPrice`/`qty` values the edit modal and the chart pass in.
The create paths had already been routed through `formatApiNum`; the modify
path was missed.

## Fix

- Run `triggerPrice` and `qty` through `formatApiNum` in `modifyTpSlOrder`,
  for both the profit and the loss leg.
- Pin it with a test that feeds the chart's `Decimal.toString()` value and
  asserts the wire body carries `0.0000001`, not `1e-7`.

## Acceptance criteria

- [x] `modifyTpSlOrder` serialises `tpPrice`/`slPrice` and `tpQty`/`slQty`
      through `formatApiNum`.
- [x] A test with `new Decimal("0.0000001").toString()` asserts
      `slPrice === "0.0000001"` and no `1e-7` anywhere in the body.
- [x] The existing per-leg body shape (BUG-0293) is unchanged.
- [x] Targeted `tpSlService` tests are green.

## Out of scope

- The `<input type="number">` binding in the create/edit modals (audit item
  W2M-02 / C9), which can lose precision before the service sees the value.
  This item fixes the wire serialisation only.
- Any change to the chart's drag snapping or tick-size derivation.

## Links

- Audit: `~/.local/state/cachy-audit/2026-11-03/w2-money.md` (W2M-01)
- BUG-0293 — `modifyTpSlOrder` wire body shape (done)
- ADR-0021 — decimal money boundary
