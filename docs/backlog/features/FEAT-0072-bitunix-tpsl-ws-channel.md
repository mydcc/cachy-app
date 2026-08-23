---
id: FEAT-0072
title: Subscribe the private Bitunix TP/SL WebSocket channel
type: feature
status: done
priority: P2
milestone: M3
editions: [community, pro, private]
area: exchange
data_class: A
adr: none
depends_on: []
estimate: 3
size: M
target_date: 2027-01-12
start_date: 2026-08-09
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

- [x] Creating, modifying, cancelling or triggering a TP/SL on the exchange
      side updates Cachy's TP/SL list without a manual refresh.
- [x] Channel payloads are schema-validated; unknown events are logged, not
      crashed on.
- [x] Reconnect/resubscribe covers the new channel like the existing three.

## Out of scope

- Notification UX for triggered stops (M3 "Notifications" bullet — separate
  item when specced).

## Open questions

- ~~Exact channel name on the wire~~ — resolved: `tp_sl`, confirmed live in
  `bitunixWs.ts`.

## What shipped

- `src/services/bitunixWs.ts` (`subscribePrivate()`) — `tp_sl` joins
  `position`/`order`/`wallet` in the same subscribe call, so it gets
  reconnect/resubscribe for free rather than needing its own path: there is
  only one place private channels are (re-)subscribed from.
- `src/services/bitunixWs/channelDispatch.ts` — validates and routes `tp_sl`
  pushes (single object or array) to `tpSlState.updateFromWs()`; covered by
  `channelDispatch.test.ts`'s `"dispatchMessage tp_sl channel"` suite.
- `src/stores/tpsl.svelte.ts` (`TpSlManager.updateFromWs`) — applies a push
  to the pending-plans cache immediately, landing or removing the leg it
  concerns without waiting for the next `ensureFresh()` poll window. This is
  also what [`FEAT-0057`](FEAT-0057-market-activity-panel-redesign.md)'s
  position-card TP/SL display and `TpSlList.svelte` both read.
- This status update was found and made while filing
  [`FEAT-0254`](FEAT-0254-tpsl-input-range-slider-ux.md) — the item was
  still `specced` despite the channel having shipped some time earlier under
  a different item's work.

## Links

- [`docs/bitunix-api/INTEGRATION_STATUS.md`](../../bitunix-api/INTEGRATION_STATUS.md)
- [`docs/bitunix-api/08_websocket.md`](../../bitunix-api/08_websocket.md)
- [`FEAT-0070`](FEAT-0070-bitunix-tpsl-placement.md) — the confirmation path
  this item promised for TP/SL creation; still applies once that item ships
