---
id: BUG-0701
title: OpenCode Go rejects every chat request — the relay never sends x-opencode-session
type: bug
status: done
branch: fix/opencode-session-header
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

- `AiManager` keeps a `sessionId` (a UUID from `newSessionId()` in
  `src/lib/ai/sessionId.ts` — no `Math.random()` fallback, unlike
  `generateId()`), persists it with the message history, restores it on load
  and rotates it in `clearHistory()` — a new conversation must not inherit the
  old routing. A stored id that no longer fits the header shape is ignored, so
  the conversation cannot end up with a different id on every request.
- The relay request carries it as `x-session-id`, a Cachy-owned header name.
- `src/lib/server/aiEndpoint.ts::isOpenCodeTarget` recognises the gateway (host
  `opencode.ai` and its subdomains).
- The two OpenAI-wire routes (chat completions and its model listing) translate
  the id for that target only: `x-opencode-session: <id>`. A missing id, or one
  outside the allowed header shape, is replaced by a fresh UUID
  (`src/lib/ai/sessionId.ts::resolveSessionId`) — an invalid header character
  would otherwise throw inside `fetch` and surface as a 500. No other provider
  sees the header.
- Both routes also send `User-Agent: CachyApp/1.0 (SvelteKit)`, matching the
  Gemini route. Unlike the session header, that one goes to **every** relay
  target: it identifies the agent, and the SSRF guard never looks at it.

## Verification

`src/lib/ai/sessionId.test.ts` pins the header shape (128 characters pass, 129
do not, CR/LF is rejected, empty/null are replaced) and that the id never comes
from `Math.random`.
`src/routes/api/ai/openai/server.test.ts` pins that an OpenCode target receives
`x-opencode-session` and the Cachy user agent, that neither OpenAI's endpoint
nor a custom gateway receives the session header, that the model listing gets
an id of its own, and that a missing or header-unsafe id is replaced by a fresh
UUID.
`src/lib/server/aiEndpoint.test.ts` pins the host rule (subdomain and trailing
dot match; `evil-opencode.ai`, `notopencode.ai`, `opencode.ai.attacker.com` and
the userinfo variant do not).
`src/stores/ai.providerFailures.test.ts` pins that the id is stable across
sends, changes after `clearHistory()`, and is omitted entirely when the
platform has no CSPRNG.

The forwarding and store assertions were verified red by removing their line:
the route test fails without the forwarded header, the store test fails without
`x-session-id`.

Not covered: the round trip through `localStorage` (the unit project runs
without a browser, so `save()`/`load()` are no-ops there). The in-memory
stability and the rotation are covered; the persistence is not.

## Scope

The fix covers the server relay, and the relay has to be enabled: "Allow server
relay" must be on for the provider, otherwise the browser talks to
`opencode.ai` directly, which answers no CORS headers and therefore fails
before any header matters.

The browser-direct path carries no session id for the same reason. The third
OpenAI-wire route (`/api/ai/openai-responses`) is not covered either — it
serves the Responses API, which OpenCode Go does not implement.

Data class: the id is random, content-free and conversation-scoped. It is
stored on the device next to the chat history and leaves the device only inside
a user-initiated request to the selected provider — the same request that
already carries the prompt and the key. It never reaches telemetry, a crash
report or a Cachy-side store.

A cross-origin redirect issued by `opencode.ai` would forward the header:
undici strips `Authorization` on a cross-origin redirect but not custom header
names. Accepted, not mitigated — the value at risk is a content-free id, the
party that can redirect already receives the conversation body (a 307/308
redirect re-sends it), and the guarded dispatcher still blocks private
addresses at dial time.
