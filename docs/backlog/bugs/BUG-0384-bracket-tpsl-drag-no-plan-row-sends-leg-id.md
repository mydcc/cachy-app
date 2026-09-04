---
id: BUG-0384
title: Bracket TP/SL drag with no tpSlState row still sends leg id — orderNotFound persists
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
assignee: none
---

# BUG-0384 — Bracket TP/SL drag with no tpSlState row still sends leg id — orderNotFound persists

## Symptom
Same toast as BUG-0386 (`TP/SL update failed: tradeErrors.orderNotFound`)
when dragging a bracket TP/SL line of a pending limit order in the case
where no corresponding row exists in `tpSlState.plansFor(symbol)`.

## Evidence
BUG-0386 fix resolves the venue order id via
`plan?.sourceOrderId ?? orderId`. When `plansFor()` returns no plan
(e.g. the row was pruned, not yet hydrated, or the bracket was created
without registering in `tpSlState`), the fallback still sends the
synthetic per-leg id (`<baseId>-tp` / `<baseId>-sl`) to the venue.

## Cause
The fallback `?? orderId` assumes the passed id is a valid venue id —
but for bracket legs it is a local UI key by construction.

## Fix (proposal)
Two options, needs decision:
1. Parse the leg id: strip a trailing `-tp`/`-sl` suffix and send the
   base id when the plan lookup misses. Simple, keeps current data flow.
2. Refuse the drag with a warning when no plan row exists (drag was
   never a supported path for brackets without a row). Safer, but
   removes an interaction.

## Acceptance criteria
- [ ] Decision made between option 1 and 2; fix implemented.
- [ ] Dragging a bracket leg with no plan row no longer sends a
      `<id>-tp`/`<id>-sl` id to the venue.
- [ ] Component test covers the no-plan-row drag case.

## Out of scope
- General leg-id redesign (BUG-0292).
- Plan coexistence misattribution (BUG-0385).

## Links
- `src/lib/windows/implementations/CandleChartView.svelte` — `handleTpSlDrop()`
- `docs/backlog/bugs/BUG-0386-tpsl-drag-order-not-found.md` — parent fix
