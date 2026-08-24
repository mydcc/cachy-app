---
id: BUG-0267
title: Server-side exchange fetches run without timeout or abort
type: bug
status: in-progress
assignee: opencode
branch: fix/bug-0267-exchange-fetch-timeouts
priority: P3
milestone: none
editions: [community, pro, private]
area: api
data_class: A
adr: none
depends_on: []
---

# BUG-0267 — Server-side exchange fetches run without timeout or abort

## Symptom

None of the outbound exchange fetches in `/api/{orders,balance,positions,sync,…}`
use an AbortController/timeout (client-side `apiService` does use signals). A hung
exchange connection holds the request — and the user's credentials in closure
scope — indefinitely; client retries can stack concurrent credentialed requests.

## Evidence

**Derived** — from reading the route handlers; the asymmetry with the client-side
signal usage and the klines route's existing helper is visible in code.

## Cause

The shared `fetchWithTimeout` helper built for klines was never rolled out to the
other exchange-bound routes.

## Acceptance criteria

- [ ] Every server-side fetch to a venue API passes through one timeout helper;
      a hanging upstream produces a typed error response within the configured
      budget — proven by a test using an never-resolving mock server
- [ ] Timeout values are documented in one place, not per-route magic numbers
- [ ] Existing route tests pass untouched

## Out of scope

Retry/backoff policy changes. Credential transit itself
([`FEAT-0285`](../features/FEAT-0285-credential-transit-boundary.md)).

## Links

- `src/routes/api/orders/+server.ts`, `src/utils/server/bitunix.ts`, `src/utils/server/bitget.ts`
- Security audit 2026-08-23, finding "no timeout/abort on exchange-bound requests" (Medium)
