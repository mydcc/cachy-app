---
id: BUG-0723
title: Security: exchange proxy and order placement hardening (passphrase, fail-open, replay, type safety)
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: exchange
data_class: none
adr: ADR-0013
depends_on: []
---

# BUG-0723 — Security: exchange proxy and order placement hardening

## Symptom

Multiple medium-severity findings in the exchange proxy and order placement path:

1. **Missing Bitget passphrase check on `/api/orders`**: Other routes check `venue.requiresPassphrase && envelope.passphrase === undefined`. The orders route omits this, returning 500 instead of 400.

2. **Incremental-migration guard fails open**: `assertPresignedConsistency` returns silently when `planForRoute` returns `null`. Unmapped routes calling `checkPresignedRequest` accept any envelope without signature validation.

3. **No server-side replay protection**: Server never validates timestamp freshness or nonce uniqueness. Relies entirely on venue.

4. **Dispatch guard droppable by two-arg wrapper**: `exchangeSignedFetch`'s `fetchFn` type allows a two-argument lambda that silently drops the `beforeAttempt` guard.

5. **Position-tiers symbol unsanitized**: Unlike `funding-rate`, position-tiers and trading-pairs interpolate symbol raw into URL and cache key.

6. **News apiKey injection**: `apiKey` interpolated without `encodeURIComponent` into CryptoPanic URL.

7. **CMC uses unguarded native fetch**: Bypasses `safeFetch` dial-time guard.

## Evidence

**Demonstrated** — all defects follow from reading the code. Fingerprints: `orders:passphrase:missingBitgetCheck`, `presigned:consistency:failOpenUnmapped`, `presigned:replay:noServerSideProtection`, `dispatch:guard:twoArgWrapperDrop`, `positionTiers:symbol:unsanitizedInjection`, `news:injection:apiKeyParamInjection`, `cmc:proxy:unguardedFetch`

## Fix

1. Add `requiresPassphrase` check to `/api/orders`.
2. Make `assertPresignedConsistency` fail closed on null plan.
3. Add timestamp window check (optional nonce cache).
4. Tighten `fetchFn` type to require three-argument signature.
5. Sanitize symbol inputs consistently across all market data routes.
6. `encodeURIComponent` for apiKey in news route.
7. Route CMC through `safeFetch`.

## Acceptance criteria

- [ ] Bitget orders without passphrase return 400, not 500
- [ ] Unmapped routes fail closed on `checkPresignedRequest`
- [ ] Symbol sanitization consistent across all market data routes
- [ ] apiKey URL-encoded in news route
- [ ] CMC uses safeFetch
- [ ] Regression tests

## Links

Security audit run-1: `~/security-audit-skill/cachy-app/run-1/`
