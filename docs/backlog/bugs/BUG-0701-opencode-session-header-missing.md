---
id: BUG-0701
title: OpenCode Go rejects every chat request — the relay never sends x-opencode-session
type: bug
status: done
priority: P2
milestone: none
created: "2026-10-19"
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0701 — OpenCode Go answers 400 because the relay sends no session id

Reported while testing the provider "OpenCode" on `dev.cachy.app`.

## Symptom

Every chat request to OpenCode's gateway failed, in three stages:

1. `HTTP 402: Upstream request failed: Insufficient account funds` — the base
   URL pointed at the pay-as-you-go path, which bills the account balance. A Go
   subscription does not fill that balance.
2. `HTTP 403: OpenCode's free tier can only be used from within OpenCode` — the
   `*-free` model ids are reserved for OpenCode's own client.
3. `HTTP 400: Request is missing x-opencode-session and cannot be routed
   efficiently` after switching to the Go endpoint.

The 400 is the one this item fixes; the other two are configuration.

## Cause

OpenCode Go's client contract (`https://opencode.ai/docs/go/#where-can-i-use-it`)
asks a client that is not OpenCode to

1. identify itself with its own User-Agent instead of a generic HTTP-library
   name, and
2. send a stable per-conversation id in `x-opencode-session`.

`src/routes/api/ai/openai/+server.ts::POST` sent neither: no `User-Agent` at all
(so undici's default went upstream) and no session header. OpenCode answers 400
before it routes anything when the header is absent.

Endpoint resolution itself was correct: `resolveProviderEndpoint` turns
`https://opencode.ai/inference/go/v1` into `…/inference/go/v1/chat/completions`
without doubling `/v1`.

## Fix

- `AiManager` keeps a `sessionId` (a UUID from `generateId()`), persists it with
  the message history, restores it on load and rotates it in `clearHistory()` —
  a new conversation must not inherit the old routing.
- The relay request carries it as `x-session-id`, a Cachy-owned header name.
- `src/lib/server/aiEndpoint.ts::isOpenCodeTarget` recognises the gateway (host
  `opencode.ai` and its subdomains).
- Both OpenAI-wire routes translate the id for that target only:
  `x-opencode-session: <id>`. A missing id, or one outside the allowed header
  shape, is replaced by a fresh UUID (`src/lib/server/aiSession.ts`) — an
  invalid header character would otherwise throw inside `fetch` and surface as
  a 500. No other provider sees the header.
- Both routes also send `User-Agent: CachyApp/1.0 (SvelteKit)`, matching the
  Gemini route.

## Verification

`src/routes/api/ai/openai/server.test.ts` pins that an OpenCode target receives
`x-opencode-session` and the Cachy user agent, that OpenAI's endpoint does not
receive the session header, that the models route forwards the id too, and that
a missing or header-unsafe id is replaced by a fresh UUID.
`src/lib/server/aiEndpoint.test.ts` pins the host rule (subdomain and trailing
dot match; `evil-opencode.ai` and `opencode.ai.attacker.com` do not).
`src/stores/ai.providerFailures.test.ts` pins that the id is stable across
sends and changes after `clearHistory()`.

The forwarding and store assertions were verified red by removing their line:
the route test fails without the forwarded header, the store test fails without
`x-session-id`.

## Scope

The fix covers the server relay. The browser-direct path cannot reach
`opencode.ai` (it sends no CORS headers), so no session id is added there.

A cross-origin redirect issued by `opencode.ai` would forward the header:
undici strips `Authorization` on a cross-origin redirect but not custom header
names. Accepted, not mitigated — the header only exists when the initial target
is `opencode.ai`, and the caller already controls `baseUrl` and the API key, so
the redirect adds no capability. The guarded dispatcher still blocks private
addresses at dial time.
