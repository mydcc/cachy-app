# ADR-0002: API authentication fails closed

- **Status:** Proposed
- **Date:** 2026-07-29
- **Deciders:** @mydcc

## Context

`checkAppAuth` in `src/lib/server/auth.ts` guards **17 API routes**:

- Trading: `/api/orders`, `/api/tpsl`, `/api/positions`, `/api/account`,
  `/api/balance`
- Sync: every `/api/sync/*` endpoint
- AI proxies: `/api/ai/anthropic`, `/api/ai/gemini`, `/api/ai/openai`
- Other: `/api/chat-v2`, `/api/external/cmc`, `/api/external/news`,
  `/api/rss-fetch`, `/api/sentiment`

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
`checkAppAuth` returns 401 and every guarded route refuses service. An
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

- Reintroducing a fail-open branch in `checkAppAuth`, or any per-route bypass
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
