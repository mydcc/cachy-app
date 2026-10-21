---
id: BUG-0722
title: Security: rate limiter implementation flaws allow bypass of all abuse ceilings
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
---

# BUG-0722 — Security: rate limiter implementation flaws allow bypass of all abuse ceilings

## Symptom

The rate limiter has two implementation flaws that compose into an effective bypass of all three abuse ceilings (issuance, per-IP, per-token):

1. **Per-token rate limit disabled beyond first 1000 tokens**: `perTokenLimiter` uses default `maxTrackedKeys=1000` but `TOKEN_MAP_CAP` is 10000. Tokens beyond the first 1000 have their rate-limit buckets evicted, so the 300/min per-token ceiling never binds.

2. **Key spray resets counters**: `evictIfCrowded` deletes oldest-inserted buckets when the map exceeds `maxTrackedKeys`. An attacker spraying distinct keys evicts a victim's bucket, resetting their rate-limit counter.

3. **IP spoofing/collapse** (needs_validation): Rate limit keyed on `getClientAddress()`, which depends on `ADDRESS_HEADER`/`XFF_DEPTH` deployment config. Misconfiguration allows bypass via X-Forwarded-For rotation or global bucket collapse.

## Evidence

**Demonstrated** for (1) and (2):

- `src/lib/server/clientToken.ts:64` — `TOKEN_MAP_CAP = 10_000`
- `src/lib/server/clientToken.ts:109` — `createRateLimiter({ windowMs: 60_000, max: 300 })` (no maxTrackedKeys)
- `src/lib/server/rateLimit.ts:53` — `DEFAULT_MAX_TRACKED_KEYS = 1000`
- `src/lib/server/rateLimit.ts:59-72` — `evictIfCrowded` deletes oldest keys under overflow

Fingerprints: `clientToken:perTokenLimiter:trackedKeyCapMismatch`, `rateLimit:evictIfCrowded:keySprayBypass`

## Fix

1. Set `maxTrackedKeys` to at least `TOKEN_MAP_CAP` (10000) in `perTokenLimiter`.
2. Change eviction to not evict non-expired keys; use LRU or reject new keys at capacity.
3. Document deployment requirements for `ADDRESS_HEADER`/`XFF_DEPTH`.

## Acceptance criteria

- [ ] `perTokenLimiter` maxTrackedKeys >= TOKEN_MAP_CAP
- [ ] Rate limiter does not evict non-expired keys under spray
- [ ] Unit tests for both fixes

## Links

Security audit run-1: `~/security-audit-skill/cachy-app/run-1/`
