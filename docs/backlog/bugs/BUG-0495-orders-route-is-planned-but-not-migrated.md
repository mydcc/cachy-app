---
id: BUG-0495
title: The orders route is listed as migrated but never checks an envelope, so the planned A5 cleanup will break order placement
type: bug
status: done
priority: P1
assignee: opencode
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: ADR-0013
depends_on: [FEAT-0405]
---

# BUG-0495 — The orders route is planned but not migrated

## Symptom

Nothing is broken today. This is a trap that is already armed: the next planned
cleanup on FEAT-0405 disables order placement entirely, and the code that will
do it already says so in a comment.

When `ENVELOPE_SIGNED_ROUTES` is deleted as planned, `/api/orders` starts taking
the client-signing path — because it has a plan row — while its server handler
still demands a raw `apiSecret` that the signing path no longer sends. Every
order, every cancel, every close-position answers with a credentials error.

## Evidence

**Derived, from reading the code.** Three facts that only bite together.

1. `/api/orders` **is** in the migration table —
   `src/utils/exchange/restSigningPlan.ts:78`:

   ```typescript
   "/api/orders": {
     signed: "body",
     signedByAction: { pending: "query", history: "query", "order-detail": "query" },
     venues: ["bitunix", "bitget"],
   },
   ```

   So `planForRoute("/api/orders")` returns a plan, and `signCachyRequest`
   (`browserSigning.ts`) will happily sign it — its only route guard is
   `if (!plan) throw SIGNING_ERRORS.ROUTE_NOT_MIGRATED`.

2. `/api/orders` is **not** guarded on the server. It is the one route in the
   table that never calls `checkPresignedRequest`. Instead,
   `src/routes/api/orders/+server.ts` still does:

   ```typescript
   const creds = extractApiCredentials(request, payload);
   const apiSecret = creds.apiSecret;
   if (!apiKey || !apiSecret) { /* refuse */ }
   ```

   Twelve routes carry a plan row; eleven call the guard. `/api/orders` is the
   gap.

3. The only thing keeping the client on the legacy path is a second, narrower
   list — `src/services/tradeService.ts:96`:

   ```typescript
   const ENVELOPE_SIGNED_ROUTES = new Set<string>(["/api/tpsl"]);
   ```

   used at `tradeService.ts:389` as
   `plan && ENVELOPE_SIGNED_ROUTES.has(endpoint)`.

And the cleanup is already declared, at `tradeService.ts:2011`:

> Removal rides with the A5 cleanup that **deletes `ENVELOPE_SIGNED_ROUTES`**.

Delete that set and the condition collapses to `plan` alone. `/api/orders` has a
plan, so it silently switches to the signed path against an unmigrated handler.

## Cause

Two lists answer "is this route cut over?" and they were allowed to disagree.
`ROUTE_SIGNING_PLAN` describes *how* a route would be signed; membership was
then also read as *whether* it is. `/api/orders` was given its plan row ahead of
its handler — reasonable while a second list held it back, and a live hazard the
moment that second list is removed as planned.

## Fix

Order matters. Either is safe alone; doing the cleanup first is not.

1. **Before** deleting `ENVELOPE_SIGNED_ROUTES`, migrate `/api/orders`: add
   `checkPresignedRequest` to the handler and drop `extractApiCredentials`, the
   way A3/A4 did for the other eleven.
2. Or, if `/api/orders` is deliberately deferred, remove its row from
   `ROUTE_SIGNING_PLAN` until its handler is ready, so plan membership means one
   thing again.

Do not "fix" this by keeping `ENVELOPE_SIGNED_ROUTES` — that leaves the two
lists disagreeing, which is BUG-0496.

## Acceptance criteria

- [ ] A test asserts every key of `ROUTE_SIGNING_PLAN` has a handler that calls
      `checkPresignedRequest` — this fails today, naming `/api/orders`
- [ ] `/api/orders` places an order end-to-end with no `apiSecret` in the
      request, or its plan row is gone
- [ ] Deleting `ENVELOPE_SIGNED_ROUTES` leaves the order lifecycle green
- [ ] No raw signing secret leaves the browser on the order path

## Links

- `docs/adr/0013-*` — client-side signing, and the hard-cutover rule
- `docs/backlog/features/FEAT-0405-client-side-signing-cutover.md` — in-progress
- BUG-0496 — the list divergence that made this possible
