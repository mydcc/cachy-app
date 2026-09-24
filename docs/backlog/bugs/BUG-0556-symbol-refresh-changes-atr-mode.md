---
id: BUG-0556
title: Refreshing a symbol silently changes the stop strategy to automatic ATR
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: calculation
data_class: A
adr: none
depends_on: []
---

# BUG-0556 — Refreshing a symbol silently changes the stop strategy to automatic ATR

## Symptom

A quote refresh, favorite selection, or market-dashboard selection can silently turn on ATR stops and switch ATR mode to automatic. The action changes position size, stop distance, risk amount, and R:R even though its label suggests only loading or refreshing price.

## Evidence

**Derived.** `src/components/inputs/TradeSetupInputs.svelte:260-266` forces `useAtrSl: true` and `atrMode: "auto"` on price fetch. `src/components/shared/MarketOverview.svelte:323-338` and `MarketDashboardModal.svelte:144-160` repeat the same mutation when selecting a symbol. The controls’ labels in `TradeSetupInputs.svelte:528-547` and `MarketOverview.svelte:451-463` describe price loading, not a stop-model change.

## Cause

Symbol-loading handlers combine market-data refresh with default initialization of a previously user-selected risk strategy instead of separating those concerns.

## Fix

Preserve the user’s stop mode and manual values across quote refreshes. Require an explicit choice when a new symbol cannot reuse the existing ATR/manual configuration. Centralize symbol-loading behavior so all surfaces behave consistently.

## Acceptance criteria

- [ ] Refreshing a quote never changes `useAtrSl`, `atrMode`, or manual stop values.
- [ ] Favorite and dashboard loading follow the same rule.
- [ ] Incompatible new-symbol metadata reports which values were preserved or cleared.
- [ ] Tests cover manual, ATR-manual, and ATR-auto modes.
- [ ] Initial empty-state defaults are explicitly separated from later refreshes.

## Out of scope

- Whether an empty new-symbol form should auto-populate a default entry or ATR value.
- Changes to ATR calculation formulas.

## Links

- `src/components/inputs/TradeSetupInputs.svelte:260-266`
- `src/components/inputs/TradeSetupInputs.svelte:528-547`
- `src/components/shared/MarketOverview.svelte:323-338`
- `src/components/shared/MarketOverview.svelte:451-463`
- `src/components/shared/MarketDashboardModal.svelte:144-160`
- Existing coverage: no backlog item records stop-strategy mutation during symbol refresh.
