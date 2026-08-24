---
id: BUG-0295
title: Ollama proxy silently 403s requests without baseUrl (default localhost) after SSRF fix
type: bug
status: done
shipped: v1.6.0-beta.126 (PR #2259)
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

## Fix (decision: Option B, chosen 2026-08-24 by the user)

Option B is implemented: make the implicit default explicit.

1. `src/lib/server/ollamaBaseUrl.ts` — shared resolver for both routes.
   Requests **without** `baseUrl` resolve to env `OLLAMA_PROXY_BASE_URL`
   (read server-side via `$env/dynamic/private`) instead of the removed
   loopback literal; the value passes through the same reserved-IP filter
   (`isUrlAllowed`/`isUrlAllowedAsync`), so an operator can point it at a
   LAN-reachable Ollama while loopback stays blocked even via env.
2. With no operator default configured, no-`baseUrl` requests get a 400 whose
   message explains why the default was removed and what to configure
   (documented in `.env.example` too).
3. Tests: no-baseUrl + unset env → documented error; no-baseUrl + env pointing
   at an allowed host → forwarded; explicit loopback → 403 unchanged; operator
   default pointing at loopback → 403 (guard never bypassed). Legacy tests that
   pinned the accidental 403 were updated to the intended contract.
4. The stale `isLocalhost` hint branch named in the Symptom section no longer
   exists on develop (the catch block only carries the generic reachability
   hint) — nothing left to remove.

## Acceptance criteria

- [x] The no-`baseUrl` behaviour of `/api/ai/ollama` and
      `/api/ai/ollama/models` is pinned by tests (Option B: unset env →
      documented 400, env set → forwarded, legacy accidental-403 tests updated)
- [x] Self-hosted operators have a working, documented path to use
      Ollama through the proxy (`OLLAMA_PROXY_BASE_URL`, documented in
      `.env.example`)
- [x] Error responses for the blocked default path explain the cause and
      remedy instead of a bare 403 message
- [x] Explicit loopback/reserved-IP URLs remain rejected with 403
      (BUG-0291 regression tests stay green; operator default pointing at
      loopback is also rejected)
- [x] The unreachable `isLocalhost` hint branch is removed or made
      reachable again — already absent on develop; nothing to change

## Out of scope

Weakening or bypassing the reserved-IP filter itself; changes to the
other AI providers' routes; client-side CORS workarounds.

## Links

- `src/routes/api/ai/ollama/+server.ts`
- `src/routes/api/ai/ollama/models/+server.ts`
- `src/services/aiModelsService.ts` (proxy fallback on direct-fetch failure)
- `src/lib/server/urlValidator.ts`
- PR #2242 (BUG-0291 fix), review note 2026-08-24
