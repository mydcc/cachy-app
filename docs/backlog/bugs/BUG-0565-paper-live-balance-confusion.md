---
id: BUG-0565
title: Live balance pushes and paper hydration share one store without a mode guard
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---


# BUG-0565 — Live balance pushes and paper hydration share one store without a mode guard

## Symptom

With a live websocket connected, switching to paper mode can show (and
measure against) the live wallet balance, and a live push arriving while
paper mode is on overwrites the simulated balance. The margin gate then
false-approves in the simulator or false-refuses live after a mode toggle.
No fund loss — the venue still decides — but a classic mode confusion in
the execution path.

## Evidence

**Derived** — the defect follows from reading the code:

- `src/stores/account.svelte.ts` `updateBalanceFromWs` writes any USDT push
  into `accountState.assets` with no paper-mode guard; its only caller is
  `src/services/bitunixWs/channelDispatch.ts:296-297` (the live wallet
  channel).
- `src/services/paperTradingService.ts:277` hydrates the paper balance into
  the same `accountState.assets` via `hydrateBalance`.
- Both `tradeService.placeOrder` and `PlaceOrderPanel.liveAvailable` read
  that one store as "the balance they trade against", so whichever writer
  ran last wins regardless of mode.

## Cause

One balance store for two modes, writers that do not know which mode is
active.

## Fix

Gate WS balance updates on the active mode (or split the balances per mode)
and resync/clear on toggle. Whichever wins should also settle the freshness
question IDEA-0563 already names for the balance (leverage has
`MAX_ACCOUNT_STATE_AGE_MS`, the balance has nothing).

## Acceptance criteria

- [ ] A test reproduces the confusion (live push while paper mode is on) and fails without the fix
- [ ] The test passes with the fix: paper reads paper, live reads live, across a toggle
- [ ] The BUG-0549 margin tests still pass unmodified in both modes

## Links

- `src/stores/account.svelte.ts` (`updateBalanceFromWs`, `hydrateBalance`)
- `src/services/bitunixWs/channelDispatch.ts:296-297`
- `src/services/paperTradingService.ts:277`
