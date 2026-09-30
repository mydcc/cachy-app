---
id: BUG-0598
title: "The Bitget WebSocket connects to the decommissioned V1 stream, and V2 splits it into two hosts with two lifecycles"
type: bug
status: specced
priority: P1
milestone: none
created: "2026-09-30"
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: [BUG-0581]
---

# Migrate the Bitget WebSocket from the V1 stream to the V2 public/private pair

Step 4 of [BUG-0576](BUG-0576-bitget-v1-api-decommissioned.md), filed on its
own because it is a lifecycle change rather than a path rewrite.

## Symptom

Live Bitget price and candle updates never arrive. Everything that falls back to
the REST market-data paths keeps working — since PR #3771 — but the streaming
path stays dead, so prices update on the polling interval instead of
immediately.

## Evidence

**Demonstrated** for the endpoint, **derived** for the consequence.

[`src/services/bitgetWs.ts:56`](../../src/services/bitgetWs.ts):

```ts
const WS_URL = "wss://ws.bitget.com/mix/v1/stream";
```

with `instType: "mc"` sent on every subscribe at `:668`, `:685` and `:716`. V1
is the generation Bitget decommissioned; over the socket the venue simply does
not deliver the requested channels.

V2 changes three things at once, and the third is why this is not a URL swap:

1. public traffic moves to `/v2/ws/public`, private traffic to `/v2/ws/private`
   — **two hosts, two sockets, two lifecycles**
2. `instType` moves from the V1 value `mc` to `USDT-FUTURES`
3. the venue forces a disconnect at 24 hours, which each socket must survive

## Cause

The single-socket design is a deliberate decision recorded in `bitgetWs.ts` —
*"single socket, shared fate — when it goes down the authenticated stream goes
with it"* — so replacing it is an architectural change, not a substitution.

Two constraints must survive it. Both are load-bearing and easy to lose in a
rewrite:

- **the subscription refcount ledger** (10 msg/s, 240 subscriptions per hour per
  connection): a subscription shared by several UI panels must be reference
  counted, and the ledger now has to exist **per socket** rather than once
- **the timing constants**: a 25 s ping (vendor allows 30 s), a 35 s watchdog, a
  2 min disconnect grace

## Fix

Two sockets, two lifecycles, `instType: "USDT-FUTURES"`.

The **public** half is verifiable without credentials — it needs no login — so
it can be split out and merged on its own, ahead of the authenticated half.
That is worth doing deliberately: the public socket is what carries
`ticker`, `candle1m`–`candle1W` and `books5`, so it is most of the
user-visible benefit.

Also settle, while the file is open: the field-name mismatch between the WS
payload and the account store. `accountState.updateOrderFromWs` /
`updatePositionFromWs` read Bitunix names (`qty`, `orderStatus`, `dealAmount`,
`positionId`, `ctime`) — see [BUG-0001](BUG-0001-bitget-ws-field-mismatch.md)
and the record in [`docs/TODO.md`](../../TODO.md). Re-checking those names
against V2 without doing it risks reintroducing the mismatch.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix — the module opens
      no `/mix/v1/stream` socket
- [ ] The public socket connects to `/v2/ws/public` and sends
      `instType: "USDT-FUTURES"`
- [ ] The private socket connects to `/v2/ws/private` with the same `instType`
- [ ] The connection survives the venue's 24-hour forced disconnect
- [ ] The subscription refcount ledger is preserved **per socket**
- [ ] Ping (25 s), watchdog (35 s) and disconnect grace (2 min) are unchanged
- [ ] The field-name mismatch recorded in `docs/TODO.md` is resolved or
      re-confirmed against V2
- [ ] The test passes with the fix

## Links

- BUG-0576 — the parent migration
- BUG-0581 — the login success code (`"0"` vs `"00000"`) is unverified and
  blocks the private half from being called verified
- BUG-0001 — WS field-name mismatch, closed but with the analysis kept as the
  record in `docs/TODO.md`
- [`docs/bitget-api/07_websocket.md`](../bitget-api/07_websocket.md),
  [`07_websocket_private.md`](../bitget-api/07_websocket_private.md)