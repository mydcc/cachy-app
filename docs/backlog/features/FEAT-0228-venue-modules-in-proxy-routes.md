---
id: FEAT-0228
title: Move the venue branches out of the proxy routes into per-venue modules
type: feature
status: in-progress
assignee: claude
branch: feat/feat-0228-venue-gateway
priority: P2
milestone: M2
editions: [community, pro, private]
area: exchange
data_class: none
adr: ADR-0007
depends_on: [FEAT-0016]
estimate: 3
size: M
target_date: 2026-12-03
start_date: 2026-08-17
---


# FEAT-0228 — Move the venue branches out of the proxy routes into per-venue modules

## Problem

The proxy routes are Cachy's venue gateway: they hold the signing and the wire
dialect. But the dialect is spread across the endpoint handlers rather than
gathered per venue — `routes/api/orders/+server.ts:108`,
`account/+server.ts:85`, `balance/+server.ts:42` and `klines/+server.ts:92`
each branch on `exchange` themselves, while the signing already lives in
`utils/server/bitget.ts` and `utils/server/bitunix.ts`.

Adding a third venue therefore means editing four route handlers, each of
which also carries schema validation and error mapping — the server-side
version of the problem [`FEAT-0016`](FEAT-0016-exchange-adapter-interface.md)
solved on the client.

## Proposal

One module per venue holding request construction, signing and response
mapping; the routes become thin transport that validates, picks the venue
module and returns. The internal contract does not change: `exchange` in the
body, `X-Provider` in the header, the same response envelope. Clients notice
nothing.

**Split from FEAT-0016 on purpose** ([`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md)):
this touches `routes/api/orders/+server.ts`, the money path, and bundling it
with the client-side boundary would have put two risks in one review.

## Acceptance criteria

- [ ] No `if (exchange === …)` branch remains in a route handler; each route
      resolves a venue module instead
- [ ] The request/response contract is unchanged — existing route tests pass
      untouched
- [ ] The order route's Zod validation and gate-related fields behave
      identically, proven by the existing `orders_*` tests
- [ ] Adding a venue means adding one module and one registry entry

## State (2026-08-27)

Implemented on `feat/feat-0228-venue-gateway`, awaiting review.

Two routes beyond the four named above turned out to branch on the venue too —
`routes/api/positions/+server.ts:108` and `routes/api/tickers/+server.ts:52`.
They are in the change: the fourth criterion below is not true while a venue
route still has to be edited to add a venue, so stopping at four would have
left the item half-done rather than smaller.

`resolveVenue` uses `Object.hasOwn` rather than a plain lookup. The klines and
tickers routes pass an unfiltered `provider` query parameter to it, and a plain
`VENUES[id]` also reaches `Object.prototype` — `?provider=toString` returned a
truthy function, skipped the default-venue fallback and turned a request that
used to serve Bitunix data into a 500. Caught by the registry test, not in
review.

The three copies of Bitunix's request signing are now gathered in one file but
still three; merging them would change wire bytes if they have drifted, which
this item's "contract is unchanged" criterion forbids. Split off as
[`FEAT-0319`](FEAT-0319-single-bitunix-request-signer.md).

Review found one venue-specific condition still inline: the tickers route's
*error* path repeats Bitunix's symbol-not-found heuristic instead of asking the
venue, while its 200 path already asks. Routing it through the module changes
what a Bitget non-2xx reports, so it is
[`FEAT-0320`](FEAT-0320-tickers-error-path-asks-the-venue.md) rather than a
late edit here.

## Out of scope

Sharing code with the client adapter. The two layers stay separate — the
client one depends on Class A browser state (ADR-0001) and must not reach the
server bundle.

## Links

- [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md)
- `src/routes/api/orders/+server.ts`, `src/routes/api/account/+server.ts`, `src/routes/api/balance/+server.ts`, `src/routes/api/klines/+server.ts`, `src/utils/server/bitget.ts`
