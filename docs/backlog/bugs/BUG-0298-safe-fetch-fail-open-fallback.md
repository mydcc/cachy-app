---
id: BUG-0298
title: safeFetch fails open when the SSRF dispatcher cannot initialize
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
size: S
estimate: 1
---

# BUG-0298 — safeFetch fails open when the SSRF dispatcher cannot initialize

## Symptom

`src/lib/server/urlValidator.ts`, `safeFetch()` (~line 228): after pre-flight
validation (`isUrlAllowedAsync`) passes, the dial-time guard is applied only
if `getSafeDispatcher()` returns a dispatcher:

```ts
const dispatcher = await getSafeDispatcher();
if (dispatcher) {
  return fetch(url, { ...init, dispatcher });
}
return fetch(url, init); // <- silent fail-open
```

`getSafeDispatcher()` catches any failure to import `undici` or construct the
Agent and caches `_safeDispatcher = null`. In that state every `safeFetch`
consumer (`rss-fetch`, `external/article-content`,
`external/check-frame-support`, both `ai/ollama` proxies) silently loses the
dial-time DNS guard — exactly the layer meant to stop DNS-rebinding/TOCTOU
between the pre-flight resolution and the actual connection. The request still
goes out, just unguarded.

## Evidence

Derived from static inspection during the 2026-08-24 hardening sweep;
**not demonstrated at runtime**. Likelihood is low — `undici` resolves
transitively in all current environments — but the fallback exists by design
and fails without a log line, so a production regression would be invisible.

## Fix

Fail closed: when the dispatcher cannot be constructed, `safeFetch` throws
(e.g. "SSRF guard unavailable") instead of issuing a bare fetch. If a fallback
must remain for availability reasons, gate it behind an explicit env flag and
log an error-level entry on every use. Optional hardening: feed the IPs
resolved by the pre-flight lookup into the dial-time check to close the TOCTOU
window entirely.

## Acceptance criteria

- [ ] A unit test simulates dispatcher-initialization failure and asserts
      `safeFetch` rejects instead of performing an unguarded fetch.
- [ ] Any remaining fallback path logs an error entry each time it is used.
- [ ] Existing `urlValidator.test.ts` cases pass unchanged.
- [ ] `npm run check` passes.

## Out of scope

- Changes to `isPrivateOrReservedHost()` range logic (reviewed sound in the
  same sweep).
- CSP work (tracked in BUG-0270) and route-handler changes.
- Replacing `undici` with another fetch implementation.
