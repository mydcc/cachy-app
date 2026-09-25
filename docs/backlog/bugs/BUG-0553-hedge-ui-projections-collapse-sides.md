---
id: BUG-0553
title: Hedge-mode UI projections collapse same-symbol positions
type: bug
status: done
assignee: opencode
priority: P1
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: []
---

# BUG-0553 — Hedge-mode UI projections collapse same-symbol positions

## Symptom

In a hedge account with both a long and short for the same symbol, leverage dialogs and TP/SL editors use the first matching position. Liquidation and PnL/ROI/change context can consequently describe only one side or the wrong side.

## Evidence

**Derived.** `src/components/inputs/ExchangeAccountControls.svelte:166-169` selects the first position with `.find(p => p.symbol === venueSymbol)`. `src/components/shared/LeverageModal.svelte:65-70` accepts one position and `:133-140`/`:226-253` projects one liquidation value. `src/components/shared/TpSlEditModal.svelte:66-77` also finds a position by symbol despite position-aware TP/SL identity.

## Cause

Execution-side protection was updated to use position identity, but the remaining UI projections still accept one symbol-level position and discard the hedge-side discriminator.

## Fix

Pass all same-symbol positions to leverage projections and show one row per isolated side. Scope TP/SL editing by `positionId`; when a legacy plan cannot be scoped unambiguously, fail closed to plain price entry without contextual PnL/ROI.

## Acceptance criteria

- [ ] A long-plus-short hedge test displays a leverage/liquidation projection for both positions.
- [ ] Opposite-side TP/SL plans derive context from their own position IDs.
- [ ] Ambiguous legacy plans do not show contextual PnL/ROI.
- [ ] Cross-margin leverage changes retain the no-single-position explanation.
- [ ] Tests cover long, short, and ambiguous legacy-plan cases.

## Out of scope

- Execution-side protection matching already covered by BUG-0524.
- Position-card plan attribution behavior.
- Cross-margin projection design.

## Links

- `src/components/inputs/ExchangeAccountControls.svelte:166-169`
- `src/components/shared/LeverageModal.svelte:65-70`
- `src/components/shared/LeverageModal.svelte:133-140`
- `src/components/shared/LeverageModal.svelte:226-253`
- `src/components/shared/TpSlEditModal.svelte:66-77`
- Existing coverage: BUG-0524; this item covers the remaining UI projections only.
