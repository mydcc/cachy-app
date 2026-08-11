---
id: FEAT-0072
title: Subscribe the private Bitunix TP/SL WebSocket channel
type: feature
status: specced
priority: P2
milestone: M3
editions: [community, pro, private]
area: exchange
data_class: A
adr: none
depends_on: []
---

# FEAT-0072 — Subscribe the private Bitunix TP/SL WebSocket channel

## Problem

The private WebSocket connection subscribes `order`, `position` and `wallet`,
but not the TP/SL channel (see
[`08_websocket.md`](../../bitunix-api/08_websocket.md) and
[`INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md) §2). TP/SL
creations, triggers and cancellations reach the UI only when a REST poll
happens to run — a triggered stop can be minutes stale on screen, and the
Bitunix docs explicitly say the WS push, not the REST response, is the
reliable confirmation for TP/SL mutations.

## Proposal

Add the TP/SL channel to the private subscription set in `bitunixWs.ts`,
validate its payload like the existing channels, and feed events into the
store that backs the pending-TP/SL list so create/update/close events update
the UI immediately. This also becomes the confirmation path for
[`FEAT-0070`](FEAT-0070-bitunix-tpsl-placement.md).

## Acceptance criteria

- [ ] Creating, modifying, cancelling or triggering a TP/SL on the exchange
      side updates Cachy's TP/SL list without a manual refresh.
- [ ] Channel payloads are schema-validated; unknown events are logged, not
      crashed on.
- [ ] Reconnect/resubscribe covers the new channel like the existing three.

## Out of scope

- Notification UX for triggered stops (M3 "Notifications" bullet — separate
  item when specced).

## Open questions

- Exact channel name on the wire: the doc crawl's private-channel tables all
  carry a copy-paste `ch: position` artefact; verify against live traffic
  (the balance channel is `wallet` in practice, not what its doc table says).

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
- [`docs/bitunix-api/08_websocket.md`](../../bitunix-api/08_websocket.md)
