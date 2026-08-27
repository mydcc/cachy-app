---
id: FEAT-0319
title: Make "destroy forgets subscriptions" a conformance-suite invariant
type: feature
status: specced
priority: P2
milestone: M2
editions: [community, pro, private]
area: exchange
data_class: none
adr: ADR-0007
depends_on: [FEAT-0018, FEAT-0227]
---

# FEAT-0319 — Make "destroy forgets subscriptions" a conformance-suite invariant

## Problem

[`FEAT-0227`](FEAT-0227-adapter-owns-its-socket.md) moved subscription
reference counting into `exchange/subscriptionLedger.ts`, above every adapter,
and hooked `SubscriptionLedger.forgetIssued()` to
`connectionManager.killAll()`. That is only sound while a second, unwritten
rule holds on the other side of the port: **when `ConnectionPort.destroy()`
returns, the venue must hold no subscriptions of its own.**

Both venue services keep an internal count behind the port as the buffer they
replay onto a fresh socket. If that count survives `destroy()`, the ledger's
re-issue raises it to 2 and sends no frame, and the single `unsubscribe` a
consumer eventually sends decrements to 1 rather than to 0 — no unsubscribe
frame is ever written, and the venue streams a channel nobody wants for the
rest of the session.

`bitunixWs.destroy()` satisfied the rule already (it clears
`pendingSubscriptions`). `bitgetWs.destroy()` did not, and the gap was
unreachable only because `syncSubscriptions` returned early for every provider
but Bitunix — the very branch FEAT-0227 removed. It is fixed and pinned by
`bitgetWs.leak.test.ts`, but it is pinned **per venue**: the third adapter
inherits nothing.

## Proposal

Lift the rule into the FEAT-0018 conformance suite, where cross-adapter
invariants live, so a new adapter cannot ship without satisfying it and
`adapterConformance.test.ts` still needs no per-adapter branching.

Give `AdapterTestHarness` one more member — an accessor for the count of
subscriptions the venue currently holds — and add one suite case that
subscribes, destroys, and asserts the venue holds nothing. Its sibling case
(transient `cleanup()` preserves the buffer, because `resubscribe()` replays
it) stays where it is: it is genuinely venue-internal, since the suite drives
the port, not the socket.

## Acceptance criteria

- [ ] `AdapterTestHarness` exposes the venue's held-subscription count
- [ ] `adapterConformance.test.ts` asserts, for every registered adapter, that
      a subscribe followed by `connection.destroy()` leaves the venue holding
      nothing
- [ ] The new case fails when `bitgetWs.destroy()`'s
      `this.subscriptions.clear()` is removed, and when the equivalent line is
      removed from `bitunixWs.destroy()`
- [ ] Adding an adapter still requires no change to
      `adapterConformance.test.ts` itself (FEAT-0018's own AC)
- [ ] `MarketDataPort.subscribe`'s contract comment in `exchange/types.ts`
      names the suite case that enforces it

## Out of scope

- Removing the venues' internal counts. They are the reconnect replay buffer,
  not a duplicate of the ledger, and `cleanup()` must keep them.
- Any change to `SubscriptionLedger` — the ledger side is already covered by
  `subscriptionLedger.test.ts`.

## Open questions

- Should the harness expose a count or a boolean "holds nothing"? A count
  makes a failure message say how far the drift went, which is what the
  Bitget case would have needed.

## Links

- `src/services/exchange/adapterConformance.harness.ts`
- `src/services/exchange/adapterConformance.test.ts`
- `src/services/bitgetWs.leak.test.ts`, `src/services/bitunixWs.leak.test.ts`
- `src/services/exchange/subscriptionLedger.ts`
- [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md)
