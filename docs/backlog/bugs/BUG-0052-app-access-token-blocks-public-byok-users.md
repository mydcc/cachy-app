---
id: BUG-0052
title: APP_ACCESS_TOKEN blocks BYOK users who have no way to know it
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: api
data_class: none
adr: ADR-0002
depends_on: []
---

# BUG-0052 — APP_ACCESS_TOKEN blocks BYOK users who have no way to know it

## Symptom

A visitor to `cachy.app`/`dev.cachy.app` who enters their own Gemini/OpenAI/
Anthropic/CoinMarketCap/CryptoPanic key in Settings still gets 401 on every
request, because `checkAppAuth()` (`src/lib/server/auth.ts`) requires a
second, separate secret — `APP_ACCESS_TOKEN` — that only the operator knows,
set in the server's `.env`. There is no way for an ordinary user to obtain
this value. The app is, in its current state, usable only by the operator (or
anyone the operator privately shares the token with), which defeats the point
of a public deployment.

## Evidence

*Derived*, from reading `checkAppAuth()` and every one of the 17 routes it
guards (per [`ADR-0002`](../../adr/0002-api-authentication-fails-closed.md)'s
own list), classifying each by who actually bears the cost/risk of an
unauthenticated call:

| Route(s) | Credential model | Evidence |
|---|---|---|
| `/api/ai/gemini`, `/api/ai/openai`, `/api/ai/anthropic` | **BYOK** | Each reads `request.headers.get("x-api-key")`, 401s if absent, forwards it to the upstream provider. No server-side fallback key. |
| `/api/orders`, `/api/tpsl`, `/api/positions`, `/api/account`, `/api/balance` | **BYOK** | `extractApiCredentials()` (`orders/+server.ts:95`, `tpsl/+server.ts:49`, etc.) reads exchange key/secret/passphrase from request headers/body; `balance/+server.ts:31` reads them straight from the body. No `.env`/`process.env` read for exchange credentials anywhere in these files. |
| `/api/sync`, `/api/sync/order-detail`, `/api/sync/orders`, `/api/sync/positions-history`, `/api/sync/positions-pending` | **BYOK** | Same pattern, exchange credentials from the request. |
| `/api/external/cmc` | **BYOK** | Requires `x-cmc-api-key` (401 without it), sourced from `settingsState.cmcApiKey`, a user Settings field. |
| `/api/external/news` | **BYOK** | Requires an `apiKey` in the request; forwarded to NewsAPI/CryptoPanic as their own key. |
| `/api/rss-fetch` | **No key — open-proxy/SSRF risk, not billing risk** | No credential at all. Already mitigated by a hardcoded `ALLOWED_DOMAINS` allowlist (`rss-fetch/+server.ts:44-66`), which `APP_ACCESS_TOKEN` adds nothing to. |
| `/api/sentiment` | **Hybrid — the one real exception** | `sentiment/+server.ts:14-15,33,48`: `const key = apiKey \|\| ENV_OPENAI_API_KEY` (and the Gemini equivalent). If the caller sends no key, this route spends the *operator's* `OPENAI_API_KEY`/`GEMINI_API_KEY` env-configured quota. This is the only route where ADR-0002's "billed to the operator" rationale is currently true. |
| `/api/chat-v2` | **Does not exist** | Removed per `docs/GLOBAL-CHAT.md:11-13` (roadmap item 12) — Global Chat now runs entirely through an external SpacetimeDB module. ADR-0002's route list is stale on this entry. |

15 of the 17 listed routes are BYOK or keyless; `APP_ACCESS_TOKEN` protects
none of them from an operator-billing standpoint — it just blocks anyone who
doesn't have the operator's private secret, BYOK or not. Only
`/api/sentiment`'s no-key fallback path genuinely spends the operator's own
quota.

## Cause

ADR-0002 introduced a single, deployment-wide shared secret to close a real
gap (`checkAppAuth` used to fail *open* with no token configured, a genuine
open-relay risk). But it applied that one secret uniformly to all 17 routes
without distinguishing which ones actually let an anonymous caller spend the
operator's money versus which ones only ever spend the caller's own
credentials. The uniform gate over-corrected: it closed the real hole
(`/api/sentiment`'s fallback, and — for `/api/rss-fetch` — SSRF/abuse, which
the domain allowlist already handles independently) but also closed every
BYOK route, which never needed it.

## Fix

Per-route classification instead of one flat gate:

- **BYOK routes** (all trading/sync routes, all three AI proxies,
  `/api/external/cmc`, `/api/external/news`) — remove the `checkAppAuth()`
  guard. The caller's own credential is already the authorization: a bad key
  fails at the upstream provider, not at this server. Replace
  `APP_ACCESS_TOKEN` with **per-IP rate limiting** on these routes, so an
  anonymous caller can't turn the server into a free load generator even
  though each call is individually harmless to the operator's wallet.
  `/api/external/news` already has an ad-hoc in-memory rate limiter
  (`_rateLimits`, `RATE_LIMIT_WINDOW`, `MAX_REQUESTS_PER_WINDOW` in
  `external/news/+server.ts`) — extract that into a shared
  `src/lib/server/rateLimit.ts` utility so every newly-opened route uses the
  same mechanism instead of reinventing it per file.
- **`/api/rss-fetch`** — keep as is. Its domain allowlist is the right
  protection for what it actually risks (SSRF/open-proxy), and
  `APP_ACCESS_TOKEN` was never doing anything for it that the allowlist
  doesn't already cover. Add the same per-IP rate limiting for defense in
  depth.
- **`/api/sentiment`** — this is the one route that needs a real decision:
  either (a) drop the `ENV_OPENAI_API_KEY`/`ENV_GEMINI_API_KEY` fallback
  entirely and require callers to always BYOK, consistent with the three AI
  proxies (simplest — makes every AI-touching route the same shape, and then
  nothing in the whole guarded set spends the operator's quota, so
  `APP_ACCESS_TOKEN` has no remaining job anywhere); or (b) keep the
  operator-funded fallback as a deliberate "free tier" and keep *only this
  route* behind `checkAppAuth`, clearly documented as the reason the gate
  still exists. (a) is recommended: a partial free tier gated by a secret
  users can't get is the same bug this item exists to fix, just smaller.
- **`APP_ACCESS_TOKEN`/`checkAppAuth`** — if (a) above is chosen, the
  mechanism has no remaining caller and can be retired outright (env var,
  `.env.example` entry, the two security tests that currently assert
  fail-closed, the Settings → Connections field, and its locale strings).
  This needs its own pass, ideally after the route-by-route split lands and
  is verified — don't delete the gate and change what it protects in the
  same commit.
- **ADR-0002** needs an amendment (or a superseding ADR) recording this
  split: it explicitly left room for "a reasonable future refinement" here.

## Acceptance criteria

- [ ] A test per newly-opened route asserts a request *without*
      `x-app-access-token` but *with* valid-shaped BYOK credentials is no
      longer rejected by `checkAppAuth` (still subject to whatever the
      upstream/rate-limiter does)
- [ ] A shared rate-limiting utility exists and is used by at least
      `/api/rss-fetch` and `/api/external/news` (proving it's not a
      per-route reimplementation)
- [ ] `/api/sentiment`'s operator-key fallback is either removed (BYOK-only)
      or explicitly, narrowly re-justified in ADR-0002's amendment — the
      item must say which
- [ ] `tests/unit/auth_fail_closed.test.ts` and any other test asserting
      universal fail-closed behavior are updated to match the new per-route
      reality, not deleted wholesale
- [ ] `docs/adr/0002-api-authentication-fails-closed.md` has an amendment (or
      is superseded) documenting the split and why
- [ ] `npm run check` and `npm test` are clean

## Out of scope

Building real per-user accounts/API-key issuance for the operator-funded
routes (if (b) is chosen for `/api/sentiment` instead of (a)). That's a much
larger multi-tenant feature and contradicts this app's local-first,
self-hosted framing (`CLAUDE.md`) unless the user decides otherwise
separately.

## Links

- [`ADR-0002`](../../adr/0002-api-authentication-fails-closed.md) — the
  decision this item amends
- `src/lib/server/auth.ts` — `checkAppAuth()`
- `src/routes/api/sentiment/+server.ts:14-15,33,48` — the one route with a
  real operator-key fallback
- `src/routes/api/external/news/+server.ts` — existing ad-hoc rate limiter to
  extract
- `src/routes/api/rss-fetch/+server.ts:44-66` — existing domain allowlist,
  unaffected by this item
- `docs/GLOBAL-CHAT.md:11-13` — confirms `/api/chat-v2` no longer exists
- `tests/unit/auth_fail_closed.test.ts`, `src/tests/security/app_auth_headers.test.ts`
