# ADR-0002: API authentication fails closed

- **Status:** Proposed
- **Date:** 2026-07-29
- **Deciders:** @mydcc

## Context

`checkClientToken` in `src/lib/server/clientToken.ts` guards **~12 API routes**:

- Trading: `/api/orders`, `/api/tpsl`, `/api/positions`, `/api/account`,
  `/api/balance`
- Sync: `/api/sync`
- AI proxies: `/api/ai/anthropic`, `/api/ai/gemini`, `/api/ai/openai`,
  `/api/ai/ollama`, `/api/ai/openrouter`
- Other: `/api/external/cmc`, `/api/external/news`,
  `/api/rss-fetch`, `/api/sentiment`, `/api/leverage-margin-mode`,
  `/api/account-settings`

It compared a client `x-app-access-token` header against the server's
`APP_ACCESS_TOKEN`, using hashed `timingSafeEqual` — sound as far as it went. But
when `APP_ACCESS_TOKEN` was **unset**, it returned `null`, meaning *allow*:

```ts
// Security: Fail open if no token is configured on the server.
// This allows the app to work without a .env file as requested by the user.
```

That was a deliberate choice, and the tests disagreed with it. Two test files —
one literally named `tests/unit/auth_fail_closed.test.ts` — asserted that a
missing token must produce a 401. Both had been failing for an unknown period.
Someone changed one side without the other.

The consequences of failing open, on a deployment that is public
(`cachy.app`, `dev.cachy.app`):

- `APP_ACCESS_TOKEN` was documented **nowhere**. There was no `.env.example`, so
  the realistic default state of any deployment was "unset", i.e. wide open.
- The three AI proxy routes forward to paid APIs using the *server's* keys. An
  open relay there is billed to the operator.
- The exchange routes require the caller to supply their own exchange
  credentials, so this is an open proxy rather than a path to someone else's
  funds — but an open proxy is still an abuse vector and an egress point.

While writing this up, a related trap surfaced: `.gitignore` contained
`! .env.example` with a space after the `!`. Git reads that as a literal
filename, so the negation never applied and any `.env.example` would have been
silently ignored — which is plausibly why the file never existed.

## Decision

**Authentication fails closed.** When `APP_ACCESS_TOKEN` is not configured,
`checkClientToken` returns 401 and every guarded route refuses service. An
unconfigured secret is a misconfiguration, not a permission grant.

The 401 body is **identical** to the wrong-token response
(`"Unauthorized: Invalid or missing App Access Token"`). An unauthenticated
caller learns nothing about whether the deployment has a token configured; the
operator gets the specific reason via `console.error` on the server.

`.env.example` is added and documents `APP_ACCESS_TOKEN` as required, with the
generation command and the note that the same value goes into
Settings → Connections → App Access Token so the browser can send it.

## Consequences

### What this enables

- A deployment that forgets the token fails loudly and immediately instead of
  quietly serving an open API.
- The two long-failing security tests express the real behaviour again, so the
  guarantee is now regression-tested rather than aspirational.

### What this costs

- **`npm run dev` no longer works against the API without a `.env`.** This is a
  real regression in convenience and the exact thing the original comment set out
  to avoid. The mitigation is documentation, not code: `.env.example` plus a
  one-line `openssl rand -hex 32`.
- **Deployment order now matters.** Setting the token must precede deploying
  this change, or every API call on the live instance answers 401. This is
  called out in the README and the pull request.
- Tests that exercise guarded routes must now provide auth. Two needed fixing:
  `cmc_proxy.test.ts` had no token at all, and `rss_fetch_ssrf.test.ts` mocked
  `../../../lib/server/auth` — one directory level too high, so the mock never
  applied and only fail-open kept it green.

### What is now forbidden

- Reintroducing a fail-open branch in `checkClientToken`, or any per-route bypass
  when the token is missing.
- Adding a guarded route without a test that proves it rejects unauthenticated
  requests.
- Returning a response that distinguishes "no token configured" from "wrong
  token" to the caller.

## Alternatives considered

**Fail open only outside production** (`NODE_ENV !== "production"`). Keeps local
development frictionless and protects the public instance. Rejected as the
default because it makes the security posture depend on an environment variable
that is itself easy to get wrong, and because a dev instance reachable on a LAN
is still exposed. It remains a reasonable future refinement if the documentation
route proves too painful — it would need an amendment to this ADR.

**Keep fail-open and delete the tests.** Rejected: it codifies an open relay on a
public deployment, and the operator-billed AI proxies make that concretely
expensive rather than theoretically untidy.

**Return 503 instead of 401** when the token is unset, on the grounds that the
fault is the server's, not the caller's. Rejected: it tells an unauthenticated
caller that the deployment is misconfigured, and the existing tests specify 401.

## Amendment (2026-08-07): self-service tokens replace the shared secret (BUG-0052)

- **Status:** Accepted
- **Deciders:** @mydcc

### Context

The decision above was sound about failing closed, but wrong about *what* to
gate on. `APP_ACCESS_TOKEN` is a single, deployment-wide secret that only the
operator can set — there is no way for an ordinary visitor to `cachy.app` to
obtain it. [`BUG-0052`](../backlog/bugs/BUG-0052-app-access-token-blocks-public-byok-users.md)
found that 15 of the 17 routes this token guarded are BYOK or keyless: they
spend the *caller's* own exchange or AI credentials, never the operator's. The
uniform gate blocked all of them for a reason that only applied to one route.

### Decision

`checkAppAuth` and its single shared secret were replaced by
`checkClientToken` (`src/lib/server/clientToken.ts`): self-issued, anonymous,
per-client bearer tokens.

- `POST /api/auth/token` is deliberately unguarded — it is how a client gets
  its first token — and is itself rate-limited per IP (20 issuances per IP
  per hour) so a script cannot mint unlimited tokens to route around the
  per-token limits below. (Shipped at 1/hour initially; raised after
  deployment showed every visitor behind a reverse proxy without
  `ADDRESS_HEADER`/`XFF_DEPTH` configured shares one IP bucket — see
  DEPLOYMENT.md and `.env.example`.)
- The server stores only `{ tokenHash, createdAt, requestCount, lastSeenAt }`
  per issued token, hashed with SHA-256 — never the raw token, mirroring how
  `APP_ACCESS_TOKEN` was hashed before comparison.
- Every route that used to call `checkAppAuth` now calls `checkClientToken`,
  which answers two questions in order: does this token exist, and is it —
  and its IP — within its rate limit (`src/lib/server/rateLimit.ts`, also now
  shared by `/api/external/news` and `/api/rss-fetch` instead of each
  reimplementing its own limiter)?
- `/api/sentiment`'s fallback to the operator's own `OPENAI_API_KEY` /
  `GEMINI_API_KEY` is removed. It is BYOK-only now, like the three AI proxies.
  This decouples the token system from cost protection entirely: a client
  token is abuse/rate protection only, never a "spend the operator's money"
  gate, so its blast radius stays small if a token is ever leaked or abused.

Authentication still fails closed: a request with no token, or a token this
server never issued, is rejected exactly like before — the failure mode this
ADR originally decided on is unchanged, only what counts as "authenticated"
is different.

`checkAppAuth`, `APP_ACCESS_TOKEN` and the `.env.example`/Settings UI/locale
strings that supported it are retired in a follow-up commit once the new
mechanism is proven working, not in the same change that introduces it.

### Local-first compatibility

Raised explicitly during triage, worth recording on its own: a *named user
account* (email/password, "who is this person") would be Class-B personal
data under [ADR-0001](0001-local-first-boundary.md), requiring its own ADR,
and would push Cachy toward multi-tenant SaaS — explicitly rejected, not what
this amendment does.

An anonymous, self-issued bearer token is a different thing: it identifies a
*client*, not a *person*. There is no registration step and no personal data
collected — the token lives client-side (`localStorage`, as part of the same
encrypted settings blob as everything else in Settings → Connections) exactly
like the exchange and AI API keys ADR-0001 already treats as "credentials of
a user-initiated request, forwarded through the proxy." Server-side, only
rate-limit bookkeeping is kept (`tokenHash`, timestamps, counts) —
operational abuse-prevention data, not user data, and it never crosses
ADR-0001's boundary the way a real account system would. Nothing here is
Class B: no field moved from local-only to server-persisted, so this
amendment does not need an ADR of its own for that reason (it needed one only
because it changes the authentication decision above).

The token store is in-memory and per-process, the same limitation the
pre-existing `/api/external/news` rate limiter already had: it resets on
restart and does not span multiple instances. That is an accepted limitation
for v1, not a regression this amendment introduces.

### Consequences

- A public visitor can now use Cachy with their own exchange/AI keys without
  ever contacting the operator, closing the gap BUG-0052 described.
- Abuse protection no longer depends on a secret that has to be distributed
  out of band; it is enforced per token and per IP instead.
- `/api/sentiment` can no longer spend the operator's AI quota under any
  circumstances — a caller without their own key gets a 401, not a silently
  operator-billed response.
- The token store resetting on restart means every client re-issues a token
  after a deployment restart. This is acceptable friction for v1 (a background
  fetch, not a user-facing flow) and is the same trade-off the news rate
  limiter already made.
