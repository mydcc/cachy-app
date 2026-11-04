---
id: BUG-0777
title: TP/SL modify serialises sub-micro prices in scientific notation
type: bug
status: done
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

**Derived, with a failing test in the fix.** Both callers can hand over
exponential notation:

- `src/lib/windows/implementations/CandleChartView.svelte` sends
  `triggerPrice: price.toString()` (chart drag).
- `src/components/shared/TpSlEditModal.svelte` sends
  `triggerPrice: String(triggerPrice)` from a `type="number"` input.
- `modifyTpSlOrder` in `src/services/trade/tpSlService.ts` wrote
  `triggerPrice` and `qty` straight into the wire body.
- The other TP/SL write paths — `placePositionTpSl`, `modifyPositionTpSl` and
  `placeTpSlOrder` — already use `formatApiNum`, and `placeOrder.ts`
  documents that the venue rejects scientific notation.

Decimal.js `toString()` switches to exponential form at exponent `<= -7`, so
`new Decimal("0.0000001").toString()` is `"1e-7"`.

## Cause

`modifyTpSlOrder` was rewritten for the venue's per-leg body (BUG-0293) but
kept the raw `triggerPrice`/`qty` values the edit modal and the chart pass in.
The create paths and `modifyPositionTpSl` already used `formatApiNum`; only
the order-level modify path was missed.

## Fix

- Run `triggerPrice` and `qty` through `formatApiNum` in `modifyTpSlOrder`,
  for both the profit and the loss leg.
- Pin both legs and both fields with the callers' `Decimal.toString()` value,
  plus a trailing-zero case so the normalisation is explicit.

## Acceptance criteria

- [x] `modifyTpSlOrder` serialises `tpPrice`/`slPrice` and `tpQty`/`slQty`
      through `formatApiNum`.
- [x] A test with `new Decimal("0.0000001").toString()` asserts both
      `tpPrice`/`slPrice` and `tpQty`/`slQty` are `"0.0000001"` and no `1e-7`
      is anywhere in the body.
- [x] The existing per-leg body shape (BUG-0293) is unchanged.
- [x] Targeted `tpSlService` tests are green.

## Out of scope

- The `<input type="number">` binding in the create/edit modals (audit item
  W2M-02), which can lose precision before the service sees the value. This
  item fixes the wire serialisation only.
- Any change to the chart's drag snapping or tick-size derivation.

## Links

- Audit 2026-11-03, W2M-01 (`w2-money`)
- BUG-0293 — `modifyTpSlOrder` wire body shape (done)
- ADR-0021 — decimal money boundary
