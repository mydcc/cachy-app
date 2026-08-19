---
id: BUG-0052
title: APP_ACCESS_TOKEN blocks BYOK users who have no way to know it
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: api
data_class: none
adr: ADR-0002
depends_on: []
start_date: 2026-08-07
target_date: 2026-08-13
size: S
estimate: 2
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

Decided design (this section supersedes the two options floated during
initial triage — resolved in discussion with @mydcc, see rationale below):
**replace the single shared `APP_ACCESS_TOKEN` with self-service, anonymous,
per-client bearer tokens plus server-side rate limiting.** Not a bare
removal of the gate — a different, more precise security layer that keeps
abuse individually revocable instead of relying on BYOK credentials alone.

1. New, deliberately unguarded route `POST /api/auth/token` issues a random,
   cryptographically strong token. No registration, no personal data — the
   client requests one (e.g. a "Create access token" action in
   Settings → Connections, replacing today's manual `APP_ACCESS_TOKEN`
   field) and it's stored client-side like any other credential.
2. Server stores only `{tokenHash, createdAt, requestCount, lastSeenAt}` per
   issued token — hashed the same way `APP_ACCESS_TOKEN` is compared today
   (SHA-256 + `timingSafeEqual`), never the raw token. No name, email, or
   other personal data.
3. Every route currently behind `checkAppAuth()` switches to a
   `checkClientToken()`-style check: does this token exist, and is it within
   its rate limit? — not "does it match the one global secret".
4. Rate limiting is enforced **per token** (with IP also tracked, to catch a
   single actor issuing many tokens to route around per-token limits).
   `/api/external/news` already has an ad-hoc in-memory limiter
   (`_rateLimits`, `RATE_LIMIT_WINDOW`, `MAX_REQUESTS_PER_WINDOW` in
   `external/news/+server.ts`) — extract that into a shared
   `src/lib/server/rateLimit.ts` used by every route instead of
   reinventing it per file.
5. **The issuance endpoint itself needs protection**, or a script can mint
   unlimited tokens to bypass per-token limits: rate-limit
   `/api/auth/token` per IP (e.g. one token per IP per hour) as the floor
   for v1. A bot challenge (e.g. Cloudflare Turnstile) at issuance is a
   reasonable follow-up if IP limiting alone proves insufficient, but isn't
   required to ship the first version.
6. **`/api/sentiment`'s operator-key fallback
   (`ENV_OPENAI_API_KEY`/`ENV_GEMINI_API_KEY`) is removed.** Every
   AI-touching route becomes BYOK-only, consistent with `/api/ai/gemini`,
   `/api/ai/openai`, `/api/ai/anthropic`. This decouples the token system
   from cost protection entirely — the client-token layer is abuse/rate
   protection only, never a "spend the operator's money" gate, which keeps
   its blast radius small if a token is ever abused.
7. **`/api/rss-fetch`** keeps its existing domain allowlist unchanged and
   also gets the shared rate limiter for defense in depth; its risk
   (SSRF/open-proxy) was never really `APP_ACCESS_TOKEN`'s to solve.
8. Once the above lands and is verified, `APP_ACCESS_TOKEN`/`checkAppAuth`
   retire entirely: env var, `.env.example` entry,
   `tests/unit/auth_fail_closed.test.ts` and
   `src/tests/security/app_auth_headers.test.ts` (rewritten to assert the
   new token flow, not deleted), the Settings → Connections field, its
   locale strings. Do this as its own follow-up commit after the new
   mechanism is proven working, not in the same change that introduces it.
9. **ADR-0002 gets an amendment** recording the move from "one operator
   secret" to "self-service per-client tokens + rate limiting", including
   the local-first compatibility reasoning below.

## Local-first compatibility

Raised explicitly during triage, worth recording: a *named user account*
(email/password, "who is this person") would be Class-B personal data under
ADR-0001 requiring its own ADR, and would push Cachy toward multi-tenant
SaaS — explicitly rejected, not proposed here.

An anonymous, self-issued bearer token is a different thing: it identifies a
*client*, not a *person*. No registration, no personal data collected — the
token lives client-side (`localStorage`) exactly like the API keys
ADR-0001 already treats as "credentials of a user-initiated request,
forwarded through the proxy." Server-side, only rate-limit bookkeeping is
kept (`tokenHash`, timestamps, counts) — operational abuse-prevention data,
not user data, and it doesn't cross ADR-0001's boundary the way a real
account system would.

## Acceptance criteria

- [x] `POST /api/auth/token` issues a random token, stores only its hash
      server-side, and is itself rate-limited per IP
- [x] Every route currently behind `checkAppAuth` validates the new client
      token instead, and enforces a per-token rate limit
- [x] A shared rate-limiting utility exists and is used by at least
      `/api/rss-fetch`, `/api/external/news`, and the new token-issuance
      route (proving it's not a per-route reimplementation)
- [x] `/api/sentiment`'s `ENV_OPENAI_API_KEY`/`ENV_GEMINI_API_KEY` fallback
      is removed; the route is BYOK-only like the three AI proxies
- [x] A test proves a request with a valid, under-limit token succeeds
      without `APP_ACCESS_TOKEN`
- [x] A test proves a request that exceeds its token's rate limit is
      rejected
- [x] A test proves the token-issuance endpoint itself is rate-limited per IP
- [x] `tests/unit/auth_fail_closed.test.ts` and
      `src/tests/security/app_auth_headers.test.ts` are rewritten to assert
      the new token flow, not deleted
- [x] `docs/adr/0002-api-authentication-fails-closed.md` has an amendment
      documenting the move to self-service tokens, including the
      local-first compatibility reasoning
- [x] `npm run check` and `npm test` are clean

## Out of scope

Building real per-user accounts tied to a person's identity (email,
password, login). Explicitly rejected during triage: that would be Class-B
personal data under ADR-0001 requiring its own ADR, and would push Cachy
toward a multi-tenant SaaS shape the local-first framing doesn't currently
intend. The self-service anonymous token above is deliberately not that.

Bot-challenge integration (e.g. Turnstile) at token issuance — noted as a
reasonable follow-up in the Fix section, not required for v1.

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
- `src/routes/api/auth/token/+server.ts` — new, to be created (token issuance)
- `src/lib/server/rateLimit.ts` — new, to be created (shared rate limiter,
  extracted from `external/news/+server.ts`)
- `src/lib/server/clientToken.ts` (or similar) — new, to be created
  (`checkClientToken()` replacing `checkAppAuth()`)
- `docs/adr/0001-local-first-boundary.md` — the boundary this item's
  "Local-first compatibility" section reasons against
