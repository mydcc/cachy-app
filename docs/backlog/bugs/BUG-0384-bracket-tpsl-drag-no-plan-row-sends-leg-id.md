---
id: BUG-0384
title: Bracket TP/SL drag with no tpSlState row still sends leg id — orderNotFound persists
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/bug-0384-tpsl-no-plan-leg-id
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

## Fix
Option 1 (strip the leg suffix), implemented in `handleTpSlDrop()`:

```ts
const venueOrderId =
    plan?.sourceOrderId ??
    stripLegSuffix(orderId, kind === "takeProfit" ? "tp" : "sl");
```

The new `stripLegSuffix()` helper in `tpslNormalize.ts` strips only the
matching `-tp`/`-sl` suffix and leaves an id without it (or with the other
leg's suffix) unchanged, so the generic non-Bitunix path is unaffected. This
covers both a missing plan row (pruned, not yet hydrated, removed mid-drag)
and a WebSocket-sourced plan that carries no `sourceOrderId`, and keeps the
drag interaction instead of refusing it.

## Acceptance criteria
- [x] Decision made between option 1 and 2; fix implemented.
- [x] Dragging a bracket leg with no plan row no longer sends a
      `<id>-tp`/`<id>-sl` id to the venue.
- [x] Component test covers the no-plan-row drag case.

## Out of scope
- General leg-id redesign (BUG-0292).
- Plan coexistence misattribution (BUG-0385).

## Links
- `src/lib/windows/implementations/CandleChartView.svelte` — `handleTpSlDrop()`
- `docs/backlog/bugs/BUG-0386-tpsl-drag-order-not-found.md` — parent fix
