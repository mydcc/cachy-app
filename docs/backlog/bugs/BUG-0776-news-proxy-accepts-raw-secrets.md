---
id: BUG-0776
title: News proxy accepts raw API secrets and keeps the key in plaintext cache keys
type: bug
status: in-progress
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

# BUG-0776 — News proxy accepts raw API secrets and keeps the key in plaintext cache keys

## Symptom

The news proxy (`POST /api/external/news`) only needs the user's news API key,
but it reads credentials through the shared `extractApiCredentials` helper.
That helper also accepts `x-api-secret`, `x-api-passphrase` and body fallbacks
(`apiSecret`, `passphrase`) — credentials this route never uses and ADR-0013
forbids outside the exchange routes.

The route also builds its in-memory cache key from the raw API key:

```ts
cacheKey = `${source}:${JSON.stringify(params)}:${plan || "default"}:${apiKey}`;
```

The cache entry lives for `CACHE_TTL = 60 * 60 * 1000`, so the raw key sits in
the process memory of a Cachy-operated server for up to an hour, in a second
place next to the request itself.

## Evidence

**Derived.** No incident observed; the defect follows from the code.

- `src/routes/api/external/news/+server.ts:67` calls
  `extractApiCredentials(request, body)` and falls back to `body.apiKey`.
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

- Read the key from `x-api-key` only. A request that carries only
  `x-api-secret`/`x-api-passphrase` is answered with `400 Unsupported
  credential header`; a body-only `apiKey` is answered with `400 Missing API
  Key`.
- Hash the key with a per-process keyed hash (HMAC-SHA256) before it becomes
  part of `cacheKey`. The cache is in-memory, so the salt only has to be
  stable until restart; a plain SHA-256 of a credential is the password-hash
  pattern CodeQL rejects.
- Send `x-api-key` from `src/services/newsService.ts` instead of putting the
  key in the JSON body.

## Acceptance criteria

- [x] A request with only `x-api-secret` returns 400 and never reaches the
      upstream fetch.
- [x] A request with `apiKey` only in the body returns 400.
- [x] No cache-map key contains the raw API key.
- [x] `newsService` sends `x-api-key` and keeps the body free of the key.
- [x] Targeted route tests are green.

## Out of scope

- Deleting `extractApiCredentials` itself. It has no production caller after
  this change, but removing it and its unit tests is a separate dead-code item.
- The telemetry and order-log findings from the same audit.

## Links

- Audit: `~/.local/state/cachy-audit/2026-11-03/w2-security.md` (W2-01)
- ADR-0013 — proxy credential boundary
- BUG-0723 — exchange proxy hardening (removed `x-api-secret` from exchange
  routes)
