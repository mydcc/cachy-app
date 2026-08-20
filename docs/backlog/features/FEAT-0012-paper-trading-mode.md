---
id: FEAT-0012
title: Add a paper-trading mode that shares the live execution path
type: feature
status: done
branch: claude/feat-0011-erledigen-k3fht2
priority: P0
milestone: M1
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: [FEAT-0011]
estimate: 3
size: M
target_date: 2026-10-16
start_date: 2026-08-01
---


# FEAT-0012 — Add a paper-trading mode that shares the live execution path

## Problem

There is no way to exercise the execution path without risking money. That has
two costs, and the second is the expensive one:

1. Users cannot practise, and cannot try a strategy without funding it.
2. **Nobody can test execution changes end to end.** Every change to order
   construction, sizing or TP/SL handling is currently verified against mocks
   and then shipped to real money. That is the situation M1 exists to end, and
   it will not end while the only way to run the real path is to trade on it.

It is also the precondition for M9: an autonomous agent has to run for a long
time in simulation before it is allowed near capital, and simulation that does
not share the live path proves nothing about the live path.

## Proposal

A mode switch that changes **one seam**: the final transport call. Everything
above it — construction, sizing, the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
gate, risk limits, OMS tracking, the journal, the UI — runs identically.

A simulated exchange behind that seam:

- fills market orders at the live feed's current price, with configurable
  slippage
- holds limit and trigger orders and fills them when the live feed crosses them
- applies the instrument's real fee schedule
- maintains a simulated balance, position and margin state that the existing
  account store consumes through the same shape as the real one
- can be made to fail, on demand — rejections, timeouts, partial fills. A
  simulator that only succeeds trains the UI for a world that does not exist.

**Paper state is Class A.** Simulated balances and positions are the user's
trading behaviour and stay in `localStorage`, like the journal.

**It must be impossible to confuse the two modes.** Persistent, unmissable
indication whenever paper mode is active — and, more importantly, the failure
that matters is the *other* direction: believing you are in paper mode while
live. The mode belongs in the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
confirmation surface, so the answer to "which mode am I in" is on the same
screen as the order.

## Acceptance criteria

- [x] Live and paper differ at exactly one call site — proven by a test that
      asserts the shared path is identical up to the transport boundary
- [x] An order placed in paper mode produces no outbound network request to any
      exchange — asserted against a mocked network
- [x] Paper orders pass through the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
      gate and are refused by it under the same conditions as live orders
- [x] Fills, fees and PnL are computed with `Decimal`
- [x] Paper positions appear in the existing account UI through the existing
      store shape, with no paper-specific components
- [~] The mode is visible on the order-confirmation surface, not only in a
      settings tab — **partially**. A persistent header badge ships, and the
      gate binds the mode to the pass so a mode change between approval and
      transmission refuses the order. There is no order-confirmation surface
      in the client yet ([`FEAT-0024`](FEAT-0024-confirmation-policy.md)); the
      mode goes on it when it exists.
- [x] Switching modes never carries state across: paper positions do not appear
      live and vice versa, asserted by a test
- [x] Paper state persists across reload and never leaves the device
- [x] Simulated rejection, timeout and partial fill are each reachable and each
      have a test

## Out of scope

- Backtesting over history. [`VISION.md`](../../VISION.md) puts it out of
  product scope; this simulates live execution, it does not replay the past.
- Modelling order-book depth and queue position. Configurable slippage first;
  realism later if it turns out to matter.
- Cross-exchange or portfolio-level simulation.

## Resolved questions

- **Where exactly is the seam?** → `tradeService.signedRequest`, and the
  enumeration is already done: [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
  funnelled every mutating order call — including TP/SL and flash-close —
  through `gatedRequest` into that one method, and its architecture test keeps
  it that way. So the question answered itself once the gate landed. There is
  one behavioural branch on the mode in the whole codebase, and a test asserts
  that count.
- **Does paper mode use the live WebSocket feed?** → **Yes.** The simulator
  fills against `marketState`, the same feed the chart draws. A simulation on
  synthetic prices proves nothing about the live path, which is the second and
  more expensive of the two problems this item exists to solve. The cost is
  accepted: paper mode needs a connection, so "practise offline" is not on
  offer. The price feed is injected rather than imported, so tests drive it
  without a connection.
- **Default slippage.** → **5 bps against the trader, on every market fill.**
  Not zero: a simulator that fills at the mid price flatters every strategy
  that trades often, and the number someone carries away from paper trading is
  the one that decides whether they fund the account. Configurable, and applied
  in the losing direction on both sides of the book.

## What shipped

- `src/services/paperExchange.ts` — the simulator. Market fills at the live
  price with slippage, resting limit/trigger orders filled when the feed
  crosses them, the instrument fee schedule, weighted-average entry on adds,
  and `Decimal` throughout. Refuses to fill when the feed has no price rather
  than inventing one.
- `src/stores/paperTrading.svelte.ts` — Class A store on its own
  `localStorage` key: mode, simulation parameters, and the simulated book.
  A corrupt blob comes back with paper mode **off**, because the dangerous
  direction is believing you are simulating.
- `src/services/paperTradingService.ts` — mode switching, the live price hook,
  and mirroring the paper book into `omsService` / `accountState` through the
  same shapes the real path writes, so no component knows the difference.
- `src/services/tradeService.ts` — the seam, one `if`, below the gate.
- `orderGate` binds the mode to the pass and the transport re-reads it, so a
  mode that moved between approval and transmission refuses the order.
- Settings sub-tab under Trading, a persistent header badge, and German and
  English strings.
- Failure injection — reject, timeout, partial fill — reachable from the
  settings panel, not only from a test.

## Follow-ups

- TP/SL plans are accepted and tracked but not independently triggered; fills
  come from the position closing. Modelling trigger semantics faithfully is
  its own piece of work, and a simulated trigger that fired differently from
  the real one would teach the wrong lesson about stop behaviour.
- The mode belongs on the order-confirmation surface when
  [`FEAT-0024`](FEAT-0024-confirmation-policy.md) builds one.
- No opening-order path exists in the client yet
  ([`FEAT-0069`](FEAT-0069-bitunix-place-order-completion.md)), so paper
  opening is exercised by tests rather than by a button.

## Links

- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the gate, and the
  same call-site enumeration
- [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md) — M9, which cannot
  start without this
- `src/services/tradeService.ts`, `src/services/omsService.ts`
