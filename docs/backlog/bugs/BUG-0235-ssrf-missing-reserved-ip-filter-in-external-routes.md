---
id: BUG-0235
title: Missing private and reserved IP filtering in external proxy routes creates SSRF vulnerability
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
start_date: 2026-08-18
size: S
estimate: 2
---


# BUG-0235 — Missing private and reserved IP filtering in external proxy routes creates SSRF vulnerability

## Symptom

An authenticated client can cause the Cachy server to issue arbitrary HTTP requests to internal networks (RFC1918), localhost services, or cloud metadata endpoints (`http://169.254.169.254`) via `/api/external/article-content` and `/api/external/check-frame-support`.

## Evidence

**Derived** from code inspection.

1. In `src/routes/api/external/article-content/+server.ts`, `isAllowedUrl` only checks that the protocol is `http:` or `https:`, allowing requests to `http://127.0.0.1`, `http://169.254.169.254`, and private subnets:
```typescript
function isAllowedUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
```
The server then fetches the URL with `fetch(targetUrl)` and parses the response DOM with JSDOM, returning extracted text content to the caller.

2. In `src/routes/api/external/check-frame-support/+server.ts`, `targetUrl` is fetched directly without any hostname/IP restriction:
```typescript
const targetUrl = url.searchParams.get("url");
...
hostname = new URL(targetUrl).hostname.toLowerCase();
...
const response = await fetch(targetUrl, { ... });
```

3. In contrast, `src/routes/api/rss-fetch/+server.ts` implements robust `isPrivateOrReservedHost()` filtering for localhost, private IPv4/IPv6, link-local, and cloud metadata addresses.

## Cause

The URL validation functions in `article-content` and `check-frame-support` were written with naive protocol checks instead of sharing a centralized, hardened SSRF validation utility.

## Fix

1. Extract `isPrivateOrReservedHost` / `isUrlAllowed` from `src/routes/api/rss-fetch/+server.ts` into a shared utility `src/lib/server/urlValidator.ts` or `src/utils/server/urlSecurity.ts`.
2. Apply the private/reserved IP filter to `src/routes/api/external/article-content/+server.ts` and `src/routes/api/external/check-frame-support/+server.ts`.
3. Reject private, loopback, and metadata destinations with HTTP 403 Forbidden.

## Acceptance criteria

- [x] A test verifies that `POST /api/external/article-content` rejects `http://127.0.0.1`, `http://localhost`, `http://169.254.169.254`, and RFC1918 private addresses with status 403.
- [x] A test verifies that `GET /api/external/check-frame-support` rejects private and loopback addresses with status 403.
- [x] Valid public HTTP/HTTPS URLs continue to be fetched and processed correctly.

## Links

- `src/routes/api/external/article-content/+server.ts`
- `src/routes/api/external/check-frame-support/+server.ts`
- `src/routes/api/rss-fetch/+server.ts`
