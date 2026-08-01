---
id: FEAT-0016
title: Put every exchange behind one adapter interface
type: feature
status: specced
priority: P1
milestone: M2
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: [FEAT-0011]
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

- [ ] No component, store or calculation file imports an exchange-specific
      module — asserted by a lint rule or an import test
- [ ] Positions, orders and balances reach the stores in one normalised shape
      regardless of exchange
- [ ] Both existing exchanges pass [`FEAT-0018`](FEAT-0018-adapter-conformance-suite.md)
- [ ] [`BUG-0001`](../bugs/BUG-0001-bitget-ws-field-mismatch.md) is fixed and its
      regression test passes
- [ ] No user-visible behaviour change for either exchange

## Out of scope

Adding a third exchange — that is the proof, and it gets its own item once the
interface exists.

## Open questions

- **Where does the WebSocket subscription lifecycle live** — in the adapter, or
  in the existing `connectionManager`? The reference-counting logic is
  cross-cutting today.
- **Do the `src/routes/api/` proxy routes become adapter-aware,** or stay
  per-exchange behind a shared contract?

## Links

- [`docs/MILESTONES.md`](../../MILESTONES.md) — M2
- `src/services/bitunixWs.ts`, `src/services/bitgetWs.ts`, `src/stores/account.svelte.ts`
