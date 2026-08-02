---
id: FEAT-0012
title: Add a paper-trading mode that shares the live execution path
type: feature
status: specced
priority: P0
milestone: M1
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: [FEAT-0011]
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

- [ ] Live and paper differ at exactly one call site — proven by a test that
      asserts the shared path is identical up to the transport boundary
- [ ] An order placed in paper mode produces no outbound network request to any
      exchange — asserted against a mocked network
- [ ] Paper orders pass through the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
      gate and are refused by it under the same conditions as live orders
- [ ] Fills, fees and PnL are computed with `Decimal`
- [ ] Paper positions appear in the existing account UI through the existing
      store shape, with no paper-specific components
- [ ] The mode is visible on the order-confirmation surface, not only in a
      settings tab
- [ ] Switching modes never carries state across: paper positions do not appear
      live and vice versa, asserted by a test
- [ ] Paper state persists across reload and never leaves the device
- [ ] Simulated rejection, timeout and partial fill are each reachable and each
      have a test

## Out of scope

- Backtesting over history. [`VISION.md`](../../VISION.md) puts it out of
  product scope; this simulates live execution, it does not replay the past.
- Modelling order-book depth and queue position. Configurable slippage first;
  realism later if it turns out to matter.
- Cross-exchange or portfolio-level simulation.

## Open questions

- **Where exactly is the seam?** `tradeService.signedRequest` is the obvious
  candidate, but TP/SL and flash-close take other routes. The full list of
  outbound order calls has to be enumerated before this is `ready` — and that
  enumeration is the same list [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
  needs, so do it once.
- **Does paper mode use the live WebSocket feed?** It should, for realism. That
  means paper mode still needs a connection, which slightly weakens "practise
  offline".
- **Default slippage.** A number that flatters the user is worse than none.

## Links

- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the gate, and the
  same call-site enumeration
- [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md) — M9, which cannot
  start without this
- `src/services/tradeService.ts`, `src/services/omsService.ts`
