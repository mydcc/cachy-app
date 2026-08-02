---
id: FEAT-0018
title: One conformance test suite every exchange adapter must pass
type: feature
status: specced
priority: P1
milestone: M2
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: [FEAT-0016]
---

# FEAT-0018 — One conformance test suite every exchange adapter must pass

## Problem

Each exchange integration is currently tested with its own tests, written
against its own assumptions. There is no shared definition of correct, so an
adapter can be wrong in a way no test covers — which is how
[`BUG-0001`](../bugs/BUG-0001-bitget-ws-field-mismatch.md) survived.

## Proposal

One suite, parameterised over adapters, run against recorded fixtures rather
than live exchanges: normalisation of positions, orders and balances; ordering
and deduplication of WebSocket updates; reconnect and resubscribe behaviour;
error mapping; precision preservation for large IDs and small prices.

Adding an exchange means recording fixtures and passing the suite. That is the
whole acceptance test for a new exchange.

## Acceptance criteria

- [ ] The suite runs against both existing adapters and passes
- [ ] Fixtures are recorded from real exchange responses, committed as test data
- [ ] Injecting [`BUG-0001`](../bugs/BUG-0001-bitget-ws-field-mismatch.md)'s
      field mismatch into an adapter makes the suite fail
- [ ] A 19-digit order ID survives normalisation unrounded — the guard from the
      `readExchangeJson` work, applied per adapter
- [ ] Adding an adapter requires no change to the suite itself

## Links

- [`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md)
- `src/routes/api/sync/orders/security.test.ts` — existing precision guard
