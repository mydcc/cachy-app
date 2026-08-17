---
id: FEAT-0016
title: Put every exchange behind one adapter interface
type: feature
status: done
branch: worktree-exchange-adapter-interface-8f7cd2
priority: P1
milestone: M2
editions: [community, pro, private]
area: exchange
data_class: none
adr: ADR-0007
depends_on: [FEAT-0011]
estimate: 3
size: M
target_date: 2026-10-30
---

# FEAT-0016 — Put every exchange behind one adapter interface

## Problem

Bitunix and Bitget are woven directly through services, stores and API routes as
two parallel implementations — `bitunixWs.ts` and `bitgetWs.ts`, separate
branches in `src/routes/api/`, exchange-specific field names reaching shared
stores. Adding a third exchange currently means touching all of it.

It also produces bugs directly: [`BUG-0001`](../bugs/BUG-0001-bitget-ws-field-mismatch.md)
exists because one shared store function reads one exchange's field names while
both exchanges call it. That is not an accident, it is what the missing
abstraction looks like.

## Proposal

An `ExchangeAdapter` interface covering market data (tickers, klines, depth,
subscriptions), account state (balances, positions, orders), and order
operations (place, modify, cancel, close), plus a normalisation layer so exactly
one internal shape for positions, orders and balances reaches the stores.

Bitunix and Bitget migrate behind it, fixing [`BUG-0001`](../bugs/BUG-0001-bitget-ws-field-mismatch.md)
as part of the migration rather than separately.

**Built after [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
deliberately:** the verification gate defines what an adapter must guarantee, so
building the gate first tells the interface what shape to be.

## Acceptance criteria

- [x] No component, store or calculation file imports an exchange-specific
      module — asserted by a lint rule or an import test
      → `src/tests/architecture/exchange_boundary.test.ts`, 6 tests, including
      synthetic violating and compliant sources so the scanner cannot pass
      vacuously.
- [x] Positions, orders and balances reach the stores in one normalised shape
      regardless of exchange
      → `NormalizedOrder` / `NormalizedPosition` moved out of
      `types/bitunix.ts` into `types/exchange.ts`; `mappers.ts` already
      duck-typed both venues into `OMSOrder` / `OMSPosition` and is unchanged.
- [ ] Both existing exchanges pass [`FEAT-0018`](FEAT-0018-adapter-conformance-suite.md)
      → **not proven, and cannot be from here:** FEAT-0018 does not exist yet
      and depends on this item. `exchangeAdapter.test.ts` asserts both adapters
      expose the same port shape, which is the seed of that suite, not the
      suite. `exchangeAdapters` exists for FEAT-0018 to iterate.
- [x] [`BUG-0001`](../bugs/BUG-0001-bitget-ws-field-mismatch.md) is fixed and its
      regression test passes
      → was already `done` before this item; its regression test passes in the
      full run below. Nothing here re-fixed it.
- [x] No user-visible behaviour change for either exchange — with three
      deliberate exceptions, listed under *Behaviour deltas* below.

## Out of scope

Adding a third exchange — that is the proof, and it gets its own item once the
interface exists.

## Behaviour deltas

Three call sites named Bitunix while the user could have Bitget selected.
Routing them through the adapter makes them follow the active exchange, which
is a visible change on Bitget and the point of the item — recorded rather than
slipped in:

1. **Symbol picker** (`lib/windows/implementations/SymbolPickerView.svelte`)
   fetched `fetchMarketSnapshot("bitunix")` and subscribed tickers on Bitunix's
   socket unconditionally. On Bitget it now shows Bitget's snapshot and
   receives live Bitget tickers, where before it showed Bitunix prices and no
   live updates (the socket refuses to run for a non-active provider,
   `bitunixWs.ts:282`).
2. **AI market context** (`stores/ai.svelte.ts`) fetched Bitunix candles
   regardless of the selected exchange. It now reads the active venue's — the
   analysis and the chart can no longer disagree about which market they mean.
3. **Trade-flow backgrounds** subscribed to Bitunix trade prints
   unconditionally. On Bitget the subscription was already dead (same guard),
   so the visible result there is unchanged; the dead call is gone.

Unchanged on purpose: an order verb the active venue has no verified format
for still travels and is still refused where it was refused before (Bitget
TP/SL, `routes/api/tpsl/+server.ts:58`). The adapter *declares* the gap in
`supports` for FEAT-0017 to read, rather than refusing locally — refusing
locally would itself be a user-visible change. See ADR-0007's last
alternative.

## Resolved questions

Both were decided by the maintainer on 2026-08-17 and written up as
[`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md), which carries the
full reasoning, the alternatives and their costs.

- **Where does the WebSocket subscription lifecycle live?** The adapter owns
  the subscription verbs and delegates them; the connection stays in
  `connectionManager`, which is the session layer and spans both venues at
  once. Moving the socket into the adapter is the end state and became
  [`FEAT-0227`](FEAT-0227-adapter-owns-its-socket.md), which depends on
  [`FEAT-0018`](FEAT-0018-adapter-conformance-suite.md) so the move runs on a
  conformance suite rather than ahead of one.
- **Do the proxy routes become adapter-aware?** No. They keep their contract
  and stay per-venue — a client adapter cannot be shared with them, since it
  depends on Class A browser state (ADR-0001). Gathering the venue branches out
  of the route handlers into per-venue modules became
  [`FEAT-0228`](FEAT-0228-venue-modules-in-proxy-routes.md).

## What was built

- `src/services/exchange/` — `types.ts` (the interface: `marketData`,
  `account`, `trading` ports plus `capabilities` / `streams` / `supports`),
  `bitunixAdapter.ts`, `bitgetAdapter.ts`, `registry.ts`
  (`activeExchange()` resolves from `settingsState.apiProvider` at call time),
  `index.ts` as the single import for consumers.
- Twelve call sites migrated: `PlaceOrderPanel`, `PositionsSidebar`,
  `TpSlEditModal`, `TpSlList`, `BackgroundAnimations`, `TradeFlowBackground`,
  `SymbolPickerView`, `FundingRatePopover`, `OpenOrdersList`,
  `OrderHistoryList`, `stores/tpsl.svelte.ts`, `stores/ai.svelte.ts`.
- `NormalizedOrder` / `NormalizedPosition` moved to `src/types/exchange.ts`.
- `PlaceOrderParams` extracted from `tradeService.placeOrder`'s inline
  parameter object so the port names the same shape instead of restating it.
- `fundingRateService.historyKey()` — the service owns its cache key; the
  popover no longer re-derives it with a venue spelled into the component.

The adapter adds no second path to the exchange: `trading` delegates to
`tradeService`'s public methods, so the FEAT-0011 gate still runs on every
order and `src/tests/architecture/order_gate_bypass.test.ts` still proves it.

## Verification

- `npm run check` — 2003 files, 0 errors, 0 warnings.
- `npm test` — 219 test files passed, 1 skipped; 1573 tests passed, 6 skipped,
  0 failures. Includes the pre-existing WS, reconnect, leak, resync, order-gate
  and BUG-0001 regression suites, none of which needed changing.
- New: `src/tests/architecture/exchange_boundary.test.ts` (6),
  `src/services/exchange/exchangeAdapter.test.ts` (14).

## Links

- [`docs/MILESTONES.md`](../../MILESTONES.md) — M2
- `src/services/bitunixWs.ts`, `src/services/bitgetWs.ts`, `src/stores/account.svelte.ts`
