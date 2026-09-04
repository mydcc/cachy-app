---
id: BUG-0385
title: TP/SL drag can modify wrong plan when position plan and pending bracket coexist
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
assignee: none
---

# BUG-0385 — TP/SL drag can modify wrong plan when position plan and pending bracket coexist

## Symptom
If a position plan AND a pending-order bracket TP/SL exist for the same
symbol at the same time, dragging the pending-order leg line substitutes
the position plan's `sourceOrderId` — the wrong plan gets modified on
the venue, silently.

## Evidence
BUG-0386 fix in `handleTpSlDrop()` looks up
`tpSlState.plansFor(normalizedSymbol)` and reads
`plans.profit` / `plans.loss` — the plan store has no key linking a
plan to the order id whose chart line was dragged. When a position plan
and a pending-order bracket coexist for one symbol, the lookup returns
whichever plan the store holds, not necessarily the one the user is
dragging.

## Cause
The drag handler only has `(kind, orderId, price)`; `plansFor()` is
keyed by symbol alone. There is no mapping from a pending order's
bracket leg to its owning plan.

## Fix (proposal)
Key the leg→plan resolution by the base order id: the pending-order
chart line already knows its base id (`<baseId>-tp`); look up the plan
by `plan.sourceOrderId === baseId` (or register pending brackets in
`tpSlState` under their base id) instead of falling back to
symbol-level `plansFor()`. Position plans keep the current lookup.

## Acceptance criteria
- [ ] With both a position plan and a pending bracket for one symbol,
      dragging the pending leg modifies the pending order's TP/SL, not
      the position plan's.
- [ ] Dragging a position plan's line still resolves to that plan.
- [ ] Component test covers the coexistence case.

## Out of scope
- Leg-id scheme redesign (BUG-0292).
- No-plan-row fallback behavior (BUG-0384).

## Links
- `src/lib/windows/implementations/CandleChartView.svelte` — `handleTpSlDrop()`
- `docs/backlog/bugs/BUG-0386-tpsl-drag-order-not-found.md` — parent fix
