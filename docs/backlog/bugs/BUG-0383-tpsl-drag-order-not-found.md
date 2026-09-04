---
id: BUG-0383
title: TP/SL drag sends synthetic per-leg order id — venue rejects with orderNotFound
type: bug
status: in-progress
priority: P1
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
assignee: claude
branch: fix-bug-0383-tpsl-drag
---

# BUG-0383 — TP/SL drag sends synthetic per-leg order id — venue rejects with orderNotFound

## Symptom
Dragging a TP or SL line in the chart window to change the level shows
the toast `TP/SL update failed: tradeErrors.orderNotFound`. The update
never reaches the venue. The console logs nothing, so there is no trace
of the failed call.

## Evidence
- `src/lib/windows/implementations/CandleChartView.svelte`, `$effect`
  building pending-order lines (FEAT-0247 / BUG-0292): bracket TP/SL
  lines for pending limit orders are created with synthetic per-leg ids
  `<baseOrderId>-tp` / `<baseOrderId>-sl`, because a pending limit order
  carries `tpPrice`/`slPrice` fields rather than separate trigger orders.
- `handleTpSlDrop()` passed that leg id straight to
  `trading.modifyTpSlOrder()` as `orderId`. The venue only knows the
  base row order id — it has never seen `123456-tp` — so it rejects with
  `orderNotFound`.
- The catch block surfaced only the toast; no logger call, hence the
  silent console.

## Cause
The chart line id (a local UI key) was reused as a venue order id
without resolving back to the real row the leg was split from.

## Fix
In `handleTpSlDrop()` (CandleChartView.svelte), resolve the real row id
via `tpSlState.plansFor(normalizedSymbol)` and send
`plan?.sourceOrderId ?? orderId` to `modifyTpSlOrder`. Also log the
failed mutation (payload + error) via `logger.warn("api", ...)` so the
toast is reproducible from the console.

Implemented on branch `fix-bug-0383-tpsl-drag` (this PR).

## Acceptance criteria
- [ ] Dragging a TP or SL line for a position plan updates the trigger
      price on the venue (no `orderNotFound` toast).
- [ ] Dragging a bracket TP/SL leg of a pending limit order sends the
      base order id, not the `<id>-tp`/`<id>-sl` leg id.
- [ ] A failed TP/SL drag mutation leaves a `logger.warn("api", ...)`
      entry with payload and error in the console.
- [ ] Component tests pass (`CandleChartView.component.test.ts`).

## Out of scope
- Bracket TP/SL with no `tpSlState` row (fallback still sends the leg id)
  → BUG-0384.
- Plan/bracket coexistence misattribution on drag → BUG-0385.
- Redesign of the synthetic leg-id scheme itself (BUG-0292).

## Links
- `src/lib/windows/implementations/CandleChartView.svelte` — `handleTpSlDrop()`
- `docs/backlog/bugs/BUG-0292-*.md` — synthetic per-leg id introduction
