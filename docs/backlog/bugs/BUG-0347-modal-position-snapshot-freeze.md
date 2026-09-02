---
id: BUG-0347
title: "Modals show frozen price and PnL due to static snapshot props"
type: bug
status: specced
priority: P0
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
---

## Problem
When a user opens a modal that requires live position data (such as the Close Position, Flash Close, or TP/SL Modals), the displayed `markPrice` and `unrealizedPnl` are frozen at the exact moment the modal was opened. This is financially critical because the user might think a position is in profit, but the live price has actually dropped significantly while they were configuring the modal inputs.

This happens because `PositionsSidebar.svelte` (and potentially other managers) stores the `position` object reference at the time of the click event (e.g. `let closingPosition = $state<OMSPosition | null>(null);`), passing a snapshot to the modal. When the position's mark price and PnL are updated via WebSocket, `mappedPositions` produces a new array of new objects, leaving the modal holding a stale reference.

## Fix
Refactor how modals receive their position state so that they always read the live reactive data. 
- Instead of storing the snapshot object in `closingPosition`, `flashClosingPosition`, etc., store the `positionId` or a unique identifier.
- Use a Svelte 5 `$derived` block in the parent component to retrieve the live position object from `mappedPositions` (or directly from the `accountState`) and pass that down to the modals.
- Ensure that `$derived` values inside the Modals (`flashCloseFacts`, `markPrice`) are properly reacting to the live reference.

## Acceptance criteria
- [ ] Modals (Close Position, Flash Close, TP/SL, Margin Adjust) display live-updating `markPrice` and `unrealizedPnl` while open.
- [ ] No regression when a position is fully closed (the modal should gracefully handle the position disappearing from the store or wait for the success callback).
- [ ] Svelte 5 reactivity is preserved across the component boundary.

## Out of scope
- Complete rewrite of the modal manager architecture.
