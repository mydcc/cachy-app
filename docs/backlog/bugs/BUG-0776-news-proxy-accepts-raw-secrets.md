---
id: BUG-0776
title: News proxy tolerates raw API secrets and keeps the key in plaintext cache keys
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: ADR-0013
depends_on: []
assignee: opencode
branch: fix/news-proxy-key-handling
---

# BUG-0776 — News proxy tolerates raw API secrets and keeps the key in plaintext cache keys

## Symptom

The news proxy (`POST /api/external/news`) only needs the user's news API key,
but it reads credentials through the shared `extractApiCredentials` helper.
That helper also accepts `x-api-secret`, `x-api-passphrase` and body fallbacks
(`apiSecret`, `passphrase`). The old route used only `creds.apiKey`, so a
secret header was silently tolerated rather than used — but the route never
rejected it, and ADR-0013 forbids accepting a raw secret on any proxy route.

Separately, the route built its in-memory cache key from the raw API key:

```ts
cacheKey = `${source}:${JSON.stringify(params)}:${plan || "default"}:${apiKey}`;
```

The cache entry lives for `CACHE_TTL = 60 * 60 * 1000`, so the raw key sat in
the process memory of a Cachy-operated server for up to an hour, in a second
place next to the request itself.

The read-only news key still transits the proxy in a header because the server
calls the provider; this change removes the secret/passphrase surface and the
key's retention, not the transit.

## Evidence

**Derived.** No incident observed; the defect follows from the code.

- `src/routes/api/external/news/+server.ts` (pre-fix) called
  `extractApiCredentials(request, body)` and fell back to `body.apiKey`.
- `src/utils/server/requestUtils.ts:27-41` reads `x-api-secret` and
  `x-api-passphrase` from headers and `apiSecret`/`passphrase` from the body.
- `src/stores/settings/secretsLoader.ts:53-54` lists `newsApiKey` and
  `cryptoPanicApiKey` as sensitive (Class A) fields.
- BUG-0723 removed `x-api-secret` from the exchange routes; the news proxy was
  outside that item's scope and kept the old reader.

## Cause

The route was written against the exchange credential helper because both
proxies started from the same request shape. The cache key then reused the raw
`apiKey` because it only had to isolate per-key quotas, not to be secret.

## Fix

- Read the key from `x-api-key` only. A request that carries
  `x-api-secret`/`x-api-passphrase` at all — even alongside a valid key — is
  answered with `400 Unsupported credential header`. A body credential field
  (`apiKey`, `apiSecret`, `passphrase`) is answered with `400 Unsupported
  credential field`.
- Hash the key with HMAC-SHA256 and a per-process key before it becomes part of
  `cacheKey`. CodeQL still flags the HMAC as a password hash; the alert is a
  false positive (the digest is an in-memory cache namespace whose entries
  expire after `CACHE_TTL`, and the HMAC key never leaves the process) and is
  dismissed in the Security tab.
- Redact the raw and URL-encoded key, and `err.cause`, from error logs.
- Send `x-api-key` from `src/services/newsService.ts` instead of putting the
  key in the JSON body.

## Acceptance criteria

- [x] A request with only `x-api-secret` returns 400 and never reaches the
      upstream fetch.
- [x] `x-api-passphrase` and `x-api-key` plus `x-api-secret` also return 400.
- [x] A body `apiKey` or `apiSecret` returns 400, even with a valid header.
- [x] No cache-map key contains the raw API key, and a repeated request is
      served from the cache.
- [x] `newsService` sends `x-api-key` and keeps the body free of the key.
- [x] Error logs contain neither the raw nor the URL-encoded key.
- [x] Targeted route and client tests are green.

## Out of scope

- Deleting `extractApiCredentials` itself. It has no production caller after
  this change, but removing it and its unit tests is a separate dead-code item.
- The news client's 400/401 UX and the cache write on a failed refresh. Both
  are pre-existing; a stale client bundle can hit them through the new 400
  paths, but widening this item would mix a transport fix with a UX fix.
- The pre-existing `pendingRequests` empty catch, the 401/403 loop across the
  three CryptoPanic plans, the substring quota detection, and the missing
  upstream timeout (tracked as PA-14 in the production audit).
- The telemetry and order-log findings from the same audit.

## Links

- Security audit 2026-11-03, W2-01: the news proxy accepted secret headers and
  kept the key in its cache keys.
- ADR-0013 — proxy credential boundary
- BUG-0723 — exchange proxy hardening (removed `x-api-secret` from exchange
  routes)
