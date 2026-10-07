---
id: BUG-0598
title: "The Bitget WebSocket connects to the decommissioned V1 stream, and V2 splits it into two hosts with two lifecycles"
type: bug
status: ready
priority: P1
milestone: none
created: "2026-09-30"
editions: [community, pro, private]
area: exchange
data_class: none
adr: none
depends_on: [BUG-0581]
branch: fix/bug-0598-ws-public-v2
---

# Migrate the Bitget WebSocket from the V1 stream to the V2 public/private pair

> **State note.** Blocked on **IDEA-0620** — the trader test protocol. The code work is landed (see the merged PR for this item's branch); what is missing is live verification against the exchange, which needs a human with API keys. No agent can close that.

Step 4 of [BUG-0576](BUG-0576-bitget-v1-api-decommissioned.md), filed on its
own because it is a lifecycle change rather than a path rewrite.

## Symptom

Live Bitget price and candle updates never arrive. Everything that falls back to
the REST market-data paths keeps working — since PR #3771 — but the streaming
path stays dead, so prices update on the polling interval instead of
immediately.

## Evidence

**Demonstrated** for the endpoint, **derived** for the consequence.

[`src/services/bitgetWs.ts:56`](../../../src/services/bitgetWs.ts):

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

- [x] A test reproduces the defect and fails without the fix — the module opens
      no `/mix/v1/stream` socket
- [x] The public socket connects to `/v2/ws/public` and sends
      `instType: "USDT-FUTURES"`
- [ ] The private socket connects to `/v2/ws/private` with the same `instType`
- [ ] The connection survives the venue's 24-hour forced disconnect
- [ ] The subscription refcount ledger is preserved **per socket**
- [x] Ping (25 s), watchdog (35 s) and disconnect grace (2 min) are unchanged
- [ ] The field-name mismatch recorded in `docs/TODO.md` is resolved or
      re-confirmed against V2
- [x] The test passes with the fix

## State — public half landed, private half open

Branch `fix/bug-0598-ws-public-v2`. Credential-free and live-verifiable, so it
was split from the authenticated half rather than waiting on it.

**Done.** Endpoint moved to `/v2/ws/public`; `instType` is `USDT-FUTURES`; the
`_UMCBL` suffix is stripped at the wire boundary and re-applied on the way in,
so a live socket writes the store key the chart actually reads; the ticker
schema speaks V2 (`lastPr`, `baseVolume`, `quoteVolume`) with the V1 spellings
kept as a fallback for a socket that has not finished reconnecting; no login is
sent, because V2's public endpoint drops a connection that tries. 24 tests in
`src/services/bitgetWs.v2.test.ts`, plus the two guards this added to
`adapterConformance.test.ts`.

**Open, and why.** Everything below needs the private socket or a venue
observation, so none of it is claimed here:

- the private socket, its login, and `orders`/`positions`/`account`. These are
  now **refused with a `logger.warn`** instead of being sent to a socket that
  would ignore them. The account panel has no live stream and the log says so —
  strictly better than the previous silence, not a fix.
  One trap for whoever builds it: the private channels subscribe with
  `instId: "default"`, and the inbound `normalizeSymbol` that maps pushes onto
  store keys would turn that into `DEFAULTUSDT`. `"default"` is a selector,
  not a symbol, and has to be excluded from that mapping.
- the refcount ledger still exists once, not per socket. Its semantics are now
  pinned by four tests so the split cannot break them quietly, and `login()` is
  kept (and its signature pinned) rather than deleted, because the private
  socket needs exactly that signing input.
- the 24 h forced disconnect. Unverifiable without holding a socket open for a
  day; the reconnect path it would hit is the same one
  `adapterConformance.test.ts` now covers.
- the `docs/TODO.md` order/position field mismatch. The market-data side
  (ticker, depth, candle) is re-confirmed against V2 and pinned; the account
  side cannot be, because nothing delivers a private push yet.

**Two decisions worth a reviewer's attention.** `books` (all levels) is now
refused: V2 sends one snapshot and then incremental deltas, and the depth
handler writes whatever arrives as the complete book, so subscribing would
replace a correct book with a partial one on every push. `books5` and `books15`
always arrive whole and stay available — the adapter already maps depth to
`books5`.

## Progress — 2026-10-07: private socket implemented, live verification pending

Branch `fix/bug-0598-ws-private`. A second `BitgetWebSocketService` instance
pointed at `wss://ws.bitget.com/v2/ws/private`, exported as `bitgetWsPrivate`:

- connects only when the active account holds keys, read via
  `keysForActiveAccount`; without them it refuses loudly and schedules no
  reconnect (no keyless retry loop against the login endpoint)
- logs in on open with the BUG-0581-verified frame, subscribes `orders` /
  `positions` / `account` on login success with `instType: USDT-FUTURES`
- the `default` selector bypasses `normalizeSymbol` on subscribe, unsubscribe
  and the throttle dry-run — it reaches the wire verbatim
- the ledger is per instance by construction; timing constants untouched
- 9 tests in `bitgetWs.private.test.ts`, all mock-verified (7 fail without
  the implementation); neighboring suites green (v2, leak, UTA
  writes/modify/preset/reads, close-single)

Deliberately not done here: nothing drives the instance yet (no adapter
wiring until the subscription path is reviewed), and the live login
handshake plus the 24 h disconnect need a trader account. The acceptance
boxes stay unchecked until the venue has answered.

## Links

- BUG-0576 — the parent migration
- BUG-0581 — the login success code (`"0"` vs `"00000"`) is unverified and
  blocks the private half from being called verified
- BUG-0001 — WS field-name mismatch, closed but with the analysis kept as the
  record in `docs/TODO.md`
- [`docs/bitget-api/07_websocket.md`](../../bitget-api/07_websocket.md),
  [`07_websocket_private.md`](../../bitget-api/07_websocket_private.md)
- the `"default"` hazard above is sharper after BUG-0599 than the text first
  suggested: the suffix is gone, but `normalizeSymbol`'s bare-pair heuristic
  still infers a quote asset from a short non-symbol, so `"default"` produces a
  plausible-looking key either way. Excluding it stays a requirement.