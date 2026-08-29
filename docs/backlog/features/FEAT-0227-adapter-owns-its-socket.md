---
id: FEAT-0227
title: Move each venue's socket and subscription ref-counting behind its adapter
type: feature
status: in-progress
assignee: claude
branch: feat/feat-0227-adapter-owns-socket
priority: P2
milestone: M2
editions: [community, pro, private]
area: exchange
data_class: none
adr: ADR-0007
depends_on: [FEAT-0016, FEAT-0018]
estimate: 5
size: L
target_date: 2026-12-10
start_date: 2026-08-17
---


# FEAT-0227 — Move each venue's socket and subscription ref-counting behind its adapter

## Problem

[`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md) drew the boundary but
left the layers behind it as they were, which [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md)
records as a sequencing decision, not an end state. Today:

- `connectionManager` owns connect / disconnect / provider-switch / visibility —
  correct, that is the session layer;
- `bitunixWs.ts` and `bitgetWs.ts` own the wire protocol **and** the
  subscription reference counting;
- `marketWatcher/subscriptionRegistry.ts` owns which symbols are wanted.

The reference counting is the piece in the wrong place. FIX, `nautilus_trader`
and CCXT Pro all put the wire half in the venue adapter and the counting half
above it, because "who wants BTCUSDT" is a consumer question and "how this
venue is told to subscribe" is a venue question. Cachy has them swapped, which
is why `subscriptionRegistry` has to know that Bitunix is special
(`subscriptionRegistry.ts:119`).

## Proposal

Each adapter owns its socket. `connectionManager` keeps the session concerns
that genuinely span both venues — `switchProvider` is atomic across them and
must stay that way. Reference counting moves into one registry above the
adapters; channel vocabulary stays inside each adapter, so no shared file ever
learns a venue's channel names.

**Waits on [`FEAT-0018`](FEAT-0018-adapter-conformance-suite.md) deliberately:**
this moves reconnect, leak and resync behaviour, and a venue layer is not moved
under a live order path without a conformance suite to certify the result
first. That is the same reason an exchange requires certification before it
lets a new adapter connect.

## Acceptance criteria

- [ ] Each adapter opens, holds and closes its own socket; no consumer and no
      shared file references `bitunixWs` or `bitgetWs`
- [ ] Subscription reference counting exists once, above the adapters; channel
      names appear only inside an adapter
- [ ] `connectionManager` retains provider switching and visibility handling,
      and `switchProvider` stays atomic across venues
- [ ] Both adapters still pass `FEAT-0018` unchanged
- [ ] The existing reconnect, leak and resync tests pass without being
      rewritten to match new behaviour — a test that had to change is a
      behaviour change and needs saying out loud

## State (2026-08-27)

Implemented on `feat/feat-0227-adapter-owns-socket`, awaiting review.

The blocker recorded here — FEAT-0018 — was already finished: its suite landed
in #2304 and was reworked into a harness in #2359, but the item's front matter
still read `in-progress`. Corrected separately so the next reader is not
stopped by it too.

Three things worth knowing before reading the diff:

**Bitget was never subscribed at all.** `syncSubscriptions` returned early for
any provider but Bitunix, so nothing the market watcher registered ever
reached Bitget's socket. Removing that branch is the item's whole point, and
it means Bitget now receives ticker, depth and kline subscriptions it did not
before.

**`positions` and `orders` are deliberately absent from both adapters'
channel vocabulary.** Both services subscribe to their private channels from
their own login flow. On Bitunix the registry's `positions` requirement was
always dead (`getBitunixChannel` returns null for it); on Bitget
`getBitgetChannel` *accepts* it, so mapping it would have put a second,
per-symbol subscription over the top of the `instId: "default"` one and
doubled every position update.

**Forgetting issued subscriptions is hooked to `destroy()`, not to
`connect()`.** `bitunixWs.cleanup()` deliberately keeps its subscription
buffer across a plain reconnect; re-issuing there would raise the venue's own
count on every reconnect with nothing to bring it back down. Only
`ConnectionManager.killAll` clears the ledger's issued set.

One test had to change: `marketWatcher_resync.test.ts` mocked `bitunixWs` and
drove its scenario by writing into that service's internal map — the
arrangement this item exists to remove. The behaviour it asserts is unchanged;
it now mocks the adapter boundary. Every other reconnect, leak and resync test
passes untouched.

## Out of scope

Changing what the sockets do. This is a move, not a redesign; a fix found on
the way gets its own bug.

## Links

- [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md) — why this was split off
- `src/services/connectionManager.ts`, `src/services/bitunixWs.ts`, `src/services/bitgetWs.ts`, `src/services/marketWatcher/subscriptionRegistry.ts`
