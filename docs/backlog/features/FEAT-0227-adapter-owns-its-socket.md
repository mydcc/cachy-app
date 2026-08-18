---
id: FEAT-0227
title: Move each venue's socket and subscription ref-counting behind its adapter
type: feature
status: specced
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

## Out of scope

Changing what the sockets do. This is a move, not a redesign; a fix found on
the way gets its own bug.

## Links

- [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md) — why this was split off
- `src/services/connectionManager.ts`, `src/services/bitunixWs.ts`, `src/services/bitgetWs.ts`, `src/services/marketWatcher/subscriptionRegistry.ts`
