---
id: BUG-0465
title: Direct market-data subscriptions are silenced by a provider teardown until the symbol changes
type: bug
status: done
assignee: opencode
shipped: 1.6.0-beta.291
priority: P2
milestone: M2
editions: [community, pro, private]
area: exchange
data_class: C
adr: ADR-0007
depends_on: []
size: M
---

# BUG-0465 — Direct market-data subscriptions are silenced by a provider teardown until the symbol changes

## Symptom

After a connection teardown the TradeFlow, AmbientTopline and
BackgroundAnimations backgrounds keep rendering but stop reacting to live
market data. Changing any setting that changes the active account, its
credentials or the venue triggers it; a forced reconnect (tab hidden for more
than 15 s, reconnect from the offline banner) triggers it too. The frame only
comes back after switching the trading symbol. With the SymbolPicker open, its
top-50 ticker strip keeps showing the REST snapshot instead of live prices.

## Evidence

**Demonstrated** at unit level, **derived** end to end.

- Demonstrated: `src/services/bitunixWs.leak.test.ts` — a `subscribeTrade()`
  listener survives `destroy()` while the wire ref-count
  (`pendingSubscriptions`) is cleared. Before the fix, nothing re-enumerated
  `tradeListeners` on connect, so the venue was never asked for the channel
  again. The new case pins the replay and its idempotency.
- Derived for the user-visible symptom: no running build was profiled, but the
  two disagreeing pieces are quoted under Cause, and the reported trigger —
  "only a symbol change brings it back" — is exactly the one path that re-runs
  the subscriber effect.

## Cause

Two registries with different lifetimes, and no replay between them:

1. `BitunixWebSocketService.destroy()` clears `pendingSubscriptions`
   (`src/services/bitunixWs.ts`) — required by FEAT-0319, so the ledger can
   re-issue what it owns. But `tradeListeners` is a **consumer** registry and
   is deliberately not cleared. After `ConnectionManager.killAll()` destroys
   the socket, the callback stays attached while the venue holds no `trade`
   subscription.
2. `flushPendingSubscriptions()` and `MarketWatcher.resync()` only replay what
   is in `pendingSubscriptions` / the `SubscriptionLedger`. `trade` is not a
   ledger requirement (`bitunixAdapter`'s `channelsForRequirement` knows only
   `ticker`/`price`/`depth_book5`/`kline_*`), so nothing re-issued it.
3. The subscriber `$effect` in `TradeFlowBackground` (and the two sibling
   backgrounds) depends on `tradeState.symbol`, `lifecycleState` and
   `apiProvider` — not on the connection state. It therefore does not re-run
   on a reconnect, so `subscribeTrade()` is not called again. A symbol change
   does re-run it, and because the new symbol's listener set is empty,
   `subscribe()` sends the wire frame again — the observed "only symbol
   switching helps".
4. `SymbolPickerView` had the same shape for `ticker`: it called
   `activeExchange().marketData.subscribe(s, "ticker")` directly, bypassing
   `MarketWatcher` and its ledger, so its 50 channels were not part of the
   resync either.

## Fix

- `BitunixWebSocketService.replayTradeSubscriptions()` re-issues the wire
  subscription for every symbol still present in `tradeListeners`, reusing
  `subscribe()` and its ref-count guard so it is idempotent. It runs in
  `connectPublic()`'s `onopen` (after `flushPendingSubscriptions()`) and in
  `connect()` when the public socket is already open.
- `SymbolPickerView` registers ticker channels through
  `marketWatcher.register/unregister`, matching `MarketOverview`, so the
  ledger owns and replays them.
- `exchange_boundary.test.ts` gains a guard that forbids direct
  `marketData.subscribe`/`unsubscribe` outside the ledger.

## Acceptance criteria

- [x] A test reproduces the lost `trade` subscription across `destroy()` and
      passes only with the replay in place.
- [x] The replay is idempotent — a second run does not raise the ref count.
- [x] `destroy()` still leaves the venue holding nothing (FEAT-0319 invariant
      intact).
- [x] `SymbolPickerView` subscribes its ticker channels through
      `marketWatcher`, not the port directly.
- [x] An architecture test fails if a future change calls
      `marketData.subscribe`/`unsubscribe` outside
      `marketWatcher/subscriptionRegistry.ts`.

## Out of scope

- Making `trade` a ledger requirement. The venue-side replay fixes the
  concrete defect without changing the ledger contract.
- `cloudService` reconnect callback duplication and `chatState`'s
  never-unsubscribed cloud listeners — separate lifecycle fix.
- Existing listener-leak backlog items (`BUG-0361`, `BUG-0362`, `BUG-0079`).

## Links

- `src/services/bitunixWs.ts` — `subscribeTrade`, `destroy`, `connectPublic`,
  `replayTradeSubscriptions`
- `src/lib/windows/implementations/SymbolPickerView.svelte`
- `src/components/shared/backgrounds/TradeFlowBackground.svelte`
- `src/components/shared/AmbientTopline.svelte`
- `src/components/shared/BackgroundAnimations.svelte`
- `src/tests/architecture/exchange_boundary.test.ts`
- [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md),
  [`FEAT-0227`](../features/FEAT-0227-adapter-owns-its-socket.md),
  [`FEAT-0319`](../features/FEAT-0319-conformance-guard-destroy-forgets-subscriptions.md)
