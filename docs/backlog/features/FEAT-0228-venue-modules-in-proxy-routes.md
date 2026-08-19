---
id: FEAT-0228
title: Move the venue branches out of the proxy routes into per-venue modules
type: feature
status: specced
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

## Out of scope

Sharing code with the client adapter. The two layers stay separate — the
client one depends on Class A browser state (ADR-0001) and must not reach the
server bundle.

## Links

- [`ADR-0007`](../../adr/0007-exchange-adapter-boundary.md)
- `src/routes/api/orders/+server.ts`, `src/routes/api/account/+server.ts`, `src/routes/api/balance/+server.ts`, `src/routes/api/klines/+server.ts`, `src/utils/server/bitget.ts`
