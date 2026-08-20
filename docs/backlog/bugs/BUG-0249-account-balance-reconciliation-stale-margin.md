---
id: BUG-0249
title: Account balance and margin do not reconcile after closing positions and stale funding rate log
type: bug
status: specced
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
estimate: 2
size: S
target_date: 2026-11-05
start_date: 2026-08-19
---

# BUG-0249 — Account balance and margin do not reconcile after closing positions and stale funding rate log

## Problem

1. When an open position is closed in Cachy (or on the exchange), the used margin and available account balance do not update automatically in the UI. The blocked margin remains displayed and available funds stay reduced until a manual page refresh.
2. The browser console repeatedly outputs `[NETWORK] [FUNDING RATE RAW]`, which was a temporary debugging artifact and should be removed.

## Root Cause

1. **Missing Post-Action Reconcile**:
   `tradeService.closePosition()`, `tradeService.placeOrder()`, and `tradeService.flashClosePosition()` submit orders but never trigger an immediate account/position reconciliation.
2. **One-Time REST Hydration**:
   `PositionsSidebar.svelte` fetches REST account balance (`fetchAccount()`) only once inside `onMount()`. It relies entirely on private WebSocket pushes from the exchange for subsequent balance updates. If Bitunix does not emit an immediate wallet push upon closing a position (or if the private WebSocket message is dropped/delayed), `accountState.assets` stays stale indefinitely.
3. **Debug Log Left Behind**:
   `src/services/bitunixWs.ts` contains `debugLogRawFundingRate()`, which logs `[NETWORK] [FUNDING RATE RAW]` periodically whenever network logs are enabled.

## Proposal

1. **Post-Action Reconciliation in `tradeService` / `accountState`**:
   After successful execution of `closePosition`, `placeOrder`, or `cancelOrder`, trigger an eager account balance and position reconciliation (`accountState.syncCallback()` or `accountState.refreshAccount()`).
2. **Remove Funding Rate Console Log**:
   Remove `debugLogRawFundingRate` from `src/services/bitunixWs.ts` and its call site in `src/services/bitunixWs/channelDispatch.ts`.
3. **Tests**:
   - Verify `closePosition()` triggers account state synchronization.
   - Verify console is free of `[FUNDING RATE RAW]` logs.

## Acceptance criteria

- [ ] Closing a position immediately updates used margin and available balance in the UI without requiring F5.
- [ ] `tradeService` triggers account balance synchronization after position close and order execution.
- [ ] The `[NETWORK] [FUNDING RATE RAW]` log is removed.
- [ ] Unit and component tests verify the reconciliation trigger and log absence.

## Verification Strategy

- `npm test src/services/tradeService.test.ts`
- `npm test src/services/bitunixWs.test.ts`
- `npm run check`

## Links

- `src/services/tradeService.ts`
- `src/stores/account.svelte.ts`
- `src/components/shared/PositionsSidebar.svelte`
- `src/services/bitunixWs.ts`
