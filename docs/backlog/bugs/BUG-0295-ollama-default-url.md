---
id: BUG-0295
title: Ollama proxy silently 403s requests without baseUrl (default localhost) after SSRF fix
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: api
data_class: none
adr: none
depends_on: [BUG-0291]
---

# BUG-0295 — Ollama proxy silently 403s requests without baseUrl (default localhost) after SSRF fix

## Symptom

After the BUG-0291 fix (PR #2242), both `/api/ai/ollama` and
`/api/ai/ollama/models` run the reserved-IP guard **after**
`resolveBaseUrl()`. `resolveBaseUrl()` still defaults an absent `baseUrl`
to `DEFAULT_BASE_URL` = `http://localhost:11434`, so a request with **no
baseUrl now gets 403** ("Invalid or prohibited base URL") where it was
previously forwarded server-side to the local Ollama instance. The change
is inherent to the requested fix but silently breaks one self-hosted
scenario:

- Browser → Ollama direct fails (CORS — this is the normal case when
  Cachy is hosted and Ollama is local).
- `aiModelsService.getModels()` falls back to the server proxy exactly in
  that case, and `fetchFromServer()` omits the `baseUrl` param when unset.
- Pre-fix that fallback reached local Ollama and worked; post-fix it 403s.

There is also no test pinning the "no-baseUrl → 403" behaviour, so the
default path is currently untested and its semantics are accidental.

Secondary cleanup: with explicit localhost URLs rejected before any fetch,
the `isLocalhost` hint branch in the catch block of
`src/routes/api/ai/ollama/+server.ts` (~lines 101–107 post-fix) is
unreachable for those URLs — harmless stale code.

## Evidence

**Derived** — from reading PR #2242's diff of
`src/routes/api/ai/ollama/+server.ts` and
`src/services/aiModelsService.ts` on develop; no live self-hosted setup
was exercised.

## Cause

BUG-0291 correctly blocks loopback/reserved IPs, including the implicit
default. The default path (no `baseUrl`) was not given an explicit
decision: it neither got documented as "no longer supported via hosted
Cachy" nor a deliberate replacement.

## Fix (proposal — decision needed)

Two options; **Option B is recommended** because it keeps the default
path working for exactly the audience that needs it without reopening
the SSRF hole:

- **Option A — document only:** document that hosted Cachy + local
  Ollama requires an explicitly configured baseUrl reachable from the
  *server* (LAN IP / hostname, not localhost); update the AI settings
  copy/hints and release notes; pin `no-baseUrl → 403` in a test so the
  behaviour is at least intentional.

- **Option B — explicit handling of the default path (recommended):**
  make the implicit default explicit:
  1. Introduce an operator-configured default (e.g. env
     `OLLAMA_PROXY_BASE_URL`, read server-side). Requests **without**
     `baseUrl` resolve to it instead of the hardcoded loopback literal;
     it is validated by the same reserved-IP filter, so an operator can
     point it at a LAN-reachable Ollama while loopback stays blocked by
     default.
  2. When no operator default is configured, respond to no-`baseUrl`
     requests with a clear error explaining why the default was removed
     and what to configure (not a bare 403).
  3. Tests: no-baseUrl + unset env → documented error; no-baseUrl +
     env pointing at a public host → forwarded; explicit loopback → 403
     unchanged.
  4. Remove or rework the now-unreachable `isLocalhost` hint branch.

Rejected alternative: allowlisting loopback for the Ollama routes —
would reintroduce SSRF against the most sensitive target class
(metadata services, internal admin panels).

## Acceptance criteria

- [ ] The no-`baseUrl` behaviour of `/api/ai/ollama` and
      `/api/ai/ollama/models` is pinned by tests (whichever way the
      decision lands)
- [ ] Self-hosted operators have a working, documented path to use
      Ollama through the proxy (env-configured default under Option B),
      or clear documentation that they must pass an explicit reachable
      baseUrl (Option A)
- [ ] Error responses for the blocked default path explain the cause and
      remedy instead of a bare 403 message
- [ ] Explicit loopback/reserved-IP URLs remain rejected with 403
      (BUG-0291 regression test stays green)
- [ ] The unreachable `isLocalhost` hint branch is removed or made
      reachable again

## Out of scope

Weakening or bypassing the reserved-IP filter itself; changes to the
other AI providers' routes; client-side CORS workarounds.

## Links

- `src/routes/api/ai/ollama/+server.ts`
- `src/routes/api/ai/ollama/models/+server.ts`
- `src/services/aiModelsService.ts` (proxy fallback on direct-fetch failure)
- `src/lib/server/urlValidator.ts`
- PR #2242 (BUG-0291 fix), review note 2026-08-24
