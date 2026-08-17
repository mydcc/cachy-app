# ADR-0007: Put every exchange behind one client-side adapter, and leave the session and gateway layers where they are

- **Status:** Proposed
- **Date:** 2026-08-17
- **Deciders:** mydcc

## Context

Bitunix and Bitget were reachable from anywhere. Nine files in the UI, store
and calculation layers imported a venue directly — `bitunixWs` from three
components, `tradeService` from four components and one store, `types/bitunix`
from `stores/account.svelte.ts` — and three more hardcoded a venue at the call
site (`fetchMarketSnapshot("bitunix")`, `normalizeSymbol(symbol, "bitunix")`,
`apiService.fetchBitunixKlines`). Every one was correct only while Bitunix
happened to be the selected exchange. `BUG-0001` is what that costs: one
shared store function read one exchange's field names while both exchanges
called it.

Three layers already handle WebSockets, and the split does not match the one
the industry uses:

| Layer | Where | Owns |
|---|---|---|
| Connection | `services/connectionManager.ts` | `registerProvider`, `switchProvider` (atomic across both venues), tab visibility, `killAll` |
| Wire protocol | `services/bitunixWs.ts:962`, `services/bitgetWs.ts:534` | `subscribe(symbol, channel)` **and** its own reference counting |
| Demand | `services/marketWatcher/subscriptionRegistry.ts` | which symbols anything currently needs |

FIX separates a session layer (logon, heartbeat, reconnect, sequence numbers)
from an application layer; `nautilus_trader` gives each venue its own
`LiveDataClient` while a `DataEngine` above it deduplicates subscriptions;
CCXT Pro keeps the socket inside the exchange instance. All of them put the
wire half in the venue adapter and the reference-counting half above it. Cachy
has the reference counting *inside* the venue services — the inverted half.

Server-side, each proxy route branches on `exchange` itself
(`routes/api/orders/+server.ts:108`, `account/+server.ts:85`,
`balance/+server.ts:42`, `klines/+server.ts:92`), while venue signing already
lives in `utils/server/bitget.ts`.

Against deciding now: the venue conformance suite (`FEAT-0018`) does not exist
yet, and the WebSocket services carry reconnect, leak and resync behaviour
covered only by their own tests.

## Decision

**One client-side `ExchangeAdapter` owns the venue-facing verbs. Components,
stores and calculations reach an exchange only through it.**

The adapter (`src/services/exchange/`) exposes three ports — `marketData`,
`account`, `trading` — plus `capabilities`, `streams` and `supports`
declarations. `activeExchange()` resolves the adapter from
`settingsState.apiProvider` **at call time**, never at module load.

**The WebSocket connection stays in `connectionManager`.** The adapter owns
the subscription verbs and delegates them to the venue's socket. Moving the
socket itself into the adapter is the end state and is deliberately deferred
to a follow-up item that depends on `FEAT-0018`, so the move runs on a
conformance suite rather than ahead of one.

**The `src/routes/api/` routes keep their contract and stay per-venue.** They
are the gateway half of a two-layer split — the client adapter speaks one
internal contract (`exchange` in the body, `X-Provider` in the header), the
routes translate it into venue dialects. A single adapter cannot span both:
the client one depends on `settingsState`, `paperExchange` and `orderGate`,
which are Class A browser state under ADR-0001.

**An adapter declares gaps rather than hiding them.** `streams.trades` is
false for Bitget because `getBitgetChannel` has no `trade` entry;
`supports.tpSl` is false because `routes/api/tpsl/+server.ts:58` refuses any
exchange but Bitunix. These are declarations for the UI to read (`FEAT-0017`),
not local guards — an unsupported verb still travels and is still refused
where it was refused before.

## Consequences

### What this enables

- A third venue is an adapter plus a registry entry. No shared file learns its
  name.
- `FEAT-0017` gets a per-adapter home for capabilities; `FEAT-0018` gets a
  uniform surface to certify and a list to iterate (`exchangeAdapters`).
- Moving the socket into the adapter later touches no consumer.

### What this costs

- One more indirection between a component and the service that does the work.
  A stack trace from a component now passes through the adapter.
- The adapter's method bodies are delegations that will be rewritten when the
  socket moves. That rewrite is bounded to the bodies; the interface and every
  call site survive it.
- Two shapes of "what this venue can do" coexist until `FEAT-0017`:
  `exchangeCapabilities.ts` (order types) and the adapter's `streams` /
  `supports` (transport and verbs).

### What is now forbidden

- No file under `src/components/`, `src/stores/` or `src/lib/` (except
  `src/lib/server/` and generated `src/lib/spacetimedb/`) may import
  `services/bitunixWs`, `services/bitgetWs`, `services/tradeService`,
  `types/bitunix` or `types/bitget`, or call a `fetchBitunix*` / `fetchBitget*`
  method. Enforced by `src/tests/architecture/exchange_boundary.test.ts`.
- A venue-neutral shape does not live in a venue-named file.
  `NormalizedOrder` and `NormalizedPosition` are in `src/types/exchange.ts`.
- An adapter must not declare a stream or a verb it has not verified. Claiming
  more than the venue does fails after the user has committed, which is worse
  than claiming less.
- The adapter must not become a second path to the exchange: `trading`
  delegates to `tradeService`'s public methods so the FEAT-0011 gate still
  runs. `src/tests/architecture/order_gate_bypass.test.ts` continues to
  enforce this.

## Alternatives considered

**Move connection and wire subscription into the adapters now (the end
state).** Rejected for sequencing, not for design: it moves roughly 2 100
lines carrying reconnect, leak and resync behaviour before `FEAT-0018` exists
to certify the result, and `switchProvider` spans both venues, so a
coordinator survives regardless. Deferred to its own item.

**Move reference counting up into a shared registry in the same change.**
Rejected for now — correct in direction, but the channel vocabulary
(`"ticker"`, `"trade"`, Bitunix's names versus Bitget's) would travel up with
it, putting venue-specific strings back into shared code, which is the
mechanism that produced BUG-0001. It belongs with the socket move.

**Make the proxy routes adapter-aware.** Rejected: it would pull Class A
browser state into the server bundle, double the diff, and touch the order
path in `routes/api/orders/+server.ts` for no user-visible gain. The
server-side cleanup that *is* worth doing — venue branches out of the route
handlers into per-venue modules — is its own item.

**Turn `supports` into a local guard that refuses unsupported verbs before
they travel.** Not taken in this change: it is a user-visible behaviour
change, which FEAT-0016's last acceptance criterion rules out. It is a real
fail-fast improvement and is recorded as its own decision to make.
