---
id: BUG-0720
title: Security: hardcoded ImgBB API key in shipped bundle and SSRF via HTTP redirect following
type: bug
status: specced
priority: P0
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: ADR-0001
depends_on: []
---

# BUG-0720 — Security: hardcoded ImgBB API key in shipped bundle and SSRF via HTTP redirect following

## Symptom

Two independent critical findings from the security audit (2026-10-21):

1. **Hardcoded ImgBB API key**: `src/stores/settings/settingsTypes.ts:601` initializes `imgbbApiKey` with a live key (`25e953ac...`) as default, unlike every other credential default which is `""`. This value is inlined into the client bundle, exposing a working ImgBB API key to every visitor.

2. **SSRF via HTTP redirects**: `safeFetch()` in `src/lib/server/urlValidator.ts` does not set `redirect:'error'` or `'manual'`. The default fetch behavior follows 301/302 redirects. On the proxy egress path, redirect targets are not re-validated, allowing an attacker-controlled public URL to redirect to `http://169.254.169.254/` or other internal addresses.

## Evidence

**Demonstrated** — both defects follow from reading the code:

- `src/stores/settings/settingsTypes.ts:601` — `imgbbApiKey: "25e953ac23d0704c1adc548c9a61b382"` (all other credentials default to `""`)
- `src/lib/server/urlValidator.ts:690` — `fetch(url, { ...init, dispatcher })` with no redirect option
- `src/lib/server/urlValidator.ts:784` — `safeFetch` entry point, no redirect policy anywhere in codebase

Fingerprints: `imgbb:defaultApiKey:shippedInBundle`, `ssrf:safeFetch:redirectFollowWithoutValidation`

## Cause

1. The ImgBB default was likely set during development and never cleared. All other credential defaults are empty strings.
2. `safeFetch` was designed with dial-time DNS guards for the direct path but never addressed redirect following, which is the default fetch behavior.

## Fix

1. Set `imgbbApiKey` default to `""` in `settingsTypes.ts`.
2. Add `redirect: 'error'` to all fetch calls in `urlValidator.ts` (`performGuardedFetch`, `fetchWithTimeout`). For routes that legitimately need redirects, implement manual redirect loop with re-validation via `isUrlAllowedAsync`.

## Acceptance criteria

- [ ] `imgbbApiKey` default is `""` (consistent with all other credentials)
- [ ] No live API key present in default settings or shipped bundle
- [ ] `safeFetch` rejects 3xx responses by default
- [ ] Any route requiring redirects re-validates each redirect target via `isUrlAllowedAsync`
- [ ] Regression tests for both fixes

## Links

Security audit run-1: `~/security-audit-skill/cachy-app/run-1/`
