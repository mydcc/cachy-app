---
id: BUG-0271
title: URL fetch proxies accept encoded-host bypasses and skip post-resolution address checks
type: bug
status: in-progress
assignee: antigravity
branch: fix-bug-0271
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: C
adr: none
depends_on: []
size: M
estimate: 5
---

# BUG-0271 — URL fetch proxies accept encoded-host bypasses and skip post-resolution address checks

## Symptom

Despite BUG-0235's blocklist in `src/lib/server/urlValidator.ts`, three gaps
remain in the SSRF guard used by `/api/external/article-content`,
`/api/rss-fetch`, and `/api/external/check-frame-support`:

1. **Octal host forms pass:** `Number("0177") === 177`, so an octal octet
   clears the decimal range check while glibc/undici resolve
   `http://0177.0.0.1` to `127.0.0.1`.
2. **Hex-encoded octets** slip the validation regex entirely.
3. **Validate-vs-dial TOCTOU:** the allowlist check runs before DNS
   resolution with no re-check of the actually-dialed address, so a
   rebinding DNS name passes validation and then resolves to an internal or
   cloud-metadata target (`169.254.169.254`).

The entry barrier is low — auth tokens are trivially mintable
(`POST /api/auth/token`, 20/hour/IP). Impact is pivoting from the server's
network position toward internal services and metadata endpoints.

## Evidence

**Derived** from code inspection during the 2026-08-23 identity audit,
resting on documented glibc/undici hostname-resolution behavior. Not live-
probed against the deployment; the reproducing tests below should pin the
behavior before the fix.

## Cause

BUG-0235 hardened literal private/reserved ranges but did not cover
non-decimal encodings or resolution-time indirection.

## Fix

- Resolve first, then validate **every** returned address against the
  private/reserved/metadata blocklist before dialing.
- Reject non-decimal host encodings (octal/hex octets) outright.
- Dial by the pinned resolved IP with the `Host` header set explicitly, so
  a second resolution cannot diverge.

## Acceptance criteria

- [x] Tests reproduce all three bypasses against `urlValidator` /
      route-level guards and fail before the fix
- [x] `http://0177.0.0.1`, hex-encoded loopback forms, and rebinding-style
      names are rejected with 403
- [x] Legitimate public URLs continue to be fetched correctly
      (existing rss-fetch/article tests stay green)
- [x] `npm run check` and the affected tests pass

## Out of scope

covered separately in
[BUG-0291](BUG-0291-ssrf-ai-proxy-baseurl.md).

## Links

- [BUG-0235](BUG-0235-ssrf-missing-reserved-ip-filter-in-external-routes.md)
  — predecessor item (done), whose utility this hardens further
- [BUG-0291](BUG-0291-ssrf-ai-proxy-baseurl.md) — sibling SSRF finding on
  the AI proxy routes
- `src/lib/server/urlValidator.ts`
- `src/routes/api/external/article-content/+server.ts`
- `src/routes/api/rss-fetch/+server.ts`
- `src/routes/api/external/check-frame-support/+server.ts`
