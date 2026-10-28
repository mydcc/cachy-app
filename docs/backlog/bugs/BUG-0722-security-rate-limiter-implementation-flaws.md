---
id: BUG-0722
title: "Security: rate limiter implementation flaws allow bypass of all abuse ceilings"
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
---

# BUG-0722 — Security: rate limiter implementation flaws allow bypass of all abuse ceilings

> **State note.** All three sub-findings are addressed. `perTokenLimiter` now
> sets `maxTrackedKeys: TOKEN_MAP_CAP` (10 000), and every place that removes
> a token record (`makeRoom`, `evictExpired`, expired-token rejection) calls
> `forget` on the limiter, so a bucket never outlives its token; the 300/min
> ceiling binds for a token issued before thousands of later ones. Eviction
> drops only expired buckets — never a live one. At capacity, a newcomer gets
> its own normal bucket in a bounded probation map (same `max`, expired-first,
> at most 1 000 entries); when both maps are full of live buckets the limiter
> fails closed rather than evicting a live bucket. That closes the
> counter-reset bypass without granting a newcomer an extra allowance and
> without a shared budget one caller could drain.
>
> Deliberate residual: an actor who can present `20 000 + min(1 000, cap/2)`
> distinct keys can keep both maps full and refuse new admissions for one
> window. IPv6 keys are aggregated to the routed /64 (the issuance limiter to
> /48, because one hosting allocation holds 65 536 /64s), so a spray needs
> distinct networks, not addresses; closing the remainder needs an admission
> mechanism (the bot challenge already named at the issuance route), not a
> bigger map. The per-token ceiling is soft by design — evicting a record or
> re-minting yields a new hash — while the per-network ceiling is the hard
> one. The news proxy is keyed on the validated client token's hash, not the
> caller-supplied API key, so arbitrary strings cannot fill a limiter map, and
> an eviction listener drops its bucket when the token record goes away.
> `normalizeClientAddress` folds IPv4-mapped and IPv4-translated addresses
> (dotted and hex), NAT64, brackets and ports, zones and leading-zero octets,
> and bounds non-IP fallbacks.
>
> Finding #3 (needs_validation) is documentation plus normalization:
> `DEPLOYMENT.md` §7 and `.env.example` require `ADDRESS_HEADER`/`XFF_DEPTH`
> for the documented proxy shape and warn that setting them on a directly
> reachable port lets a caller spoof IPs; `normalizeClientAddress` closes the
> address-family rotation the docs do not cover.
>
> RED proof: the new/changed assertions fail against the previous
> implementations for the intended reasons (counter reset under spray,
> newcomer admitted by eviction, expired key routed through probation, address
> rotation across one /64 or /48, NAT64 collapse, per-token ceiling never
> binding, evicted tokens keeping news buckets, rotating apiKeys bypassing the
> news limiter) and pass with the fix.

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

- [x] `perTokenLimiter` maxTrackedKeys >= TOKEN_MAP_CAP
- [x] Rate limiter does not evict non-expired keys under spray
- [x] Unit tests for both fixes

## Links

Security audit run-1: `~/security-audit-skill/cachy-app/run-1/`
