---
id: BUG-0291
title: AI proxy routes accept a body-controlled baseUrl without reserved-IP filtering
type: bug
status: in-progress
assignee: antigravity
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
---

# BUG-0291 — AI proxy routes accept a body-controlled baseUrl without reserved-IP filtering

## Symptom

The hosted deployment can be made to issue server-side HTTP requests to
attacker-chosen hosts, including loopback, RFC1918 and cloud-metadata addresses.

## Evidence

**Derived** — from reading the code; nobody has demonstrated it live.

- `src/routes/api/ai/ollama/+server.ts:27–35,76` — `resolveBaseUrl()` validates
  only the protocol, then the route does `fetch(`${baseUrl}/v1/chat/completions`)`
  and streams the response back to the client. No private/reserved-IP check.
- This is the same defect class [`BUG-0235`](BUG-0235-ssrf-missing-reserved-ip-filter-in-external-routes.md)
  fixed for `article-content` and `check-frame-support`; the AI routes were
  missed. `rss-fetch` carries the correct `isPrivateOrReservedHost()` filter to copy.
- `/api/auth/token` self-mints a token (`src/lib/server/clientToken.ts`), so no
  operator secret is needed to reach the route.
- Per audit comments, `/api/ai/gemini/models` and `/api/ai/ollama/models` share
  the `resolveBaseUrl` pattern — verify during the fix rather than assume.

A derived defect needs the reproducing test written *before* the fix.

## Cause

The reserved-host validator built for BUG-0235 was applied to two sibling routes
but not extracted into a shared helper every external-fetch route uses.

## Fix

Extract the shared reserved-host validator (loopback, private, link-local,
reserved, metadata endpoints) and apply it inside every AI route that accepts a
client-supplied base URL; reject with 403. Do not touch the routes' response
envelopes or auth model.

## Acceptance criteria

- [x] A test posts `baseUrl` values for `127.0.0.1`, `169.254.169.254`,
      `10.x`, `192.168.x`, `[::1]` and decimal/octal-encoded loopback to every
      affected route and gets 403 — failing without the fix
- [x] A legitimate public HTTPS base URL still passes validation (test)
- [x] No other route gains or loses behaviour — existing route tests pass untouched

## Out of scope

Reworking the BYOK/proxy architecture itself ([`FEAT-0285`](../features/FEAT-0285-credential-transit-boundary.md)).
Token expiry/TTL ([`BUG-0287`](BUG-0287-client-token-map-no-ttl.md)).

## Links

- [`BUG-0235`](BUG-0235-ssrf-missing-reserved-ip-filter-in-external-routes.md) — the fixed siblings
- `src/routes/api/ai/ollama/+server.ts`, `src/routes/api/ai/gemini/models/+server.ts`
- `src/routes/api/rss-fetch/+server.ts` — reference implementation of the filter
