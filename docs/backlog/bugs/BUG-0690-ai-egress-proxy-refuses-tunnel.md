---
id: BUG-0690
title: AI routes stay broken behind a proxy that answers TCP but refuses the tunnel
type: bug
status: done
assignee: opencode
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: [BUG-0689]
---

# BUG-0690 — AI routes stay broken behind a proxy that answers TCP but refuses the tunnel

## Symptom

After BUG-0689 shipped (`1.6.0-beta.416`), `/api/ai/*` on the staging deployment
still answered `500 {"error":"fetch failed"}` within ~0.2 s — for every provider
and every host. The message carried no `[CODE]` suffix, so the failure was *not*
the "nothing listening" case that fix was written for.

## Evidence

**Demonstrated** — observed on the deployment and reproduced locally.

- `dev.cachy.app` runs `1.6.0-beta.416`; the release commit
  (`42e08f6c6`) contains the probe from BUG-0689, so the deployed build is the
  fixed one.
- `GET /api/ai/gemini/models` (dummy key) → `500 {"error":"fetch failed"}` in
  0.17–0.24 s, again without a code suffix.
- Local reproduction: a fake proxy that accepts the TCP connection and answers
  `407` to `CONNECT` makes the old code fail exactly the same way. The cause
  code undici reports for a refused tunnel is `UND_ERR_ABORTED`, which is not on
  the list of codes the message may name — hence the bare message.

## Cause

BUG-0689 replaced "adopt the proxy blindly" with "adopt it when it answers a TCP
connect". That is not the same question as "can this proxy carry a request": a
port that accepts connections but refuses `CONNECT` (or wants credentials, or
speaks the wrong protocol) passes the probe and then fails every request. The
probe also could not help in the opposite direction — a deployment that *needs*
the proxy and blocks direct connections would have been pushed onto the direct
path by a probe that said "dead".

## Fix

`src/lib/server/urlValidator.ts` in #4117:

- The probe is gone. Both egress paths — the environment's proxy and a direct
  connection — are built lazily, and **both carry the same dial-time guard**.
- `safeFetch` tries the configured path first and, when the dial fails, retries
  once over the **direct** path and remembers it once that attempt has carried a
  request, so the cost is one failed attempt per process.
- The fallback is **one-directional**: `proxy → direct` only. The reverse is
  deliberately not offered, because the proxy resolves the target itself — a
  repeat there would tunnel past the dial-time decision the direct attempt just
  applied (a review finding: the symmetric version was an SSRF hole reachable
  with a self-minted client token).
- The repeat is narrow: never after a guard refusal (tagged with
  `ERR_SSRF_GUARD`, matched on the tag and the message), never for a body that
  cannot be sent twice, and never for a non-idempotent request whose failure does
  not *prove* it never left the process — `ECONNRESET`, `EPIPE`,
  `UND_ERR_SOCKET` and `ETIMEDOUT` are treated as possibly delivered, while a
  refused CONNECT tunnel (`UND_ERR_ABORTED` + "HTTP Tunneling") is provably
  pre-request and still recovers for POSTs.
- The direct path's lookup exempts nothing; the proxy exemption exists only on
  the proxy path. A proxy whose own address does not resolve is treated as an
  unavailable path instead of one that fails every dial.

## Acceptance criteria

- [x] A proxy that answers TCP but refuses `CONNECT` no longer breaks the AI
      routes: the request recovers over the direct path (verified end-to-end for
      GET and for a JSON POST).
- [x] A dead proxy (nothing listening) recovers the same way.
- [x] A live proxy is still used; no behaviour change without proxy variables.
- [x] The direct path never falls back to the proxy.
- [x] A dial refused by the guard is never repeated on either path.
- [x] A non-idempotent request is not repeated on a failure that may already
      have reached the provider.
- [x] A path is only preferred after it has carried a request.

## Verification

Six new tests in `urlValidator.test.ts`, each verified red against the mutation
it guards:

| test | mutation that makes it fail |
| --- | --- |
| retry and stickiness (GET, POST-via-refused-tunnel, ambiguous failure) | the retry removed, or the non-idempotent gate dropped |
| never falls back from the direct path to the proxy | the fallback made symmetric again |
| preference kept when both paths fail | the preference assigned before the retry succeeds |
| guard refusal not replayed (by message / by tag) | the tag check removed |
| direct path exempts nothing | the direct lookup given the pinned exemption |
| stream body / aborted signal not replayed | the respective guard removed |

`npx vitest run --project=unit src/lib/server/urlValidator.test.ts
src/routes/api/ai src/routes/api/external/article-content
src/tests/security/rss_fetch_ssrf.test.ts` → 12 files, 104 tests pass.
End-to-end against the real module: a proxy that refuses `CONNECT` → recovers
over the direct path for both GET and POST; a dead proxy → recovers; a live proxy
→ still used.

## Follow-up

The proxy configuration was **not** what broke staging: the requests never
reached a proxy. The real cause was that the runtime's `fetch` cannot drive a
dispatcher from the newer `undici` package at all on Node 22 and 24, so the
guarded path failed before any connection — see
[BUG-0691](BUG-0691-guarded-fetch-unusable-on-node-22-24.md). The path fallback
this item introduced stays: it is what makes a genuinely unusable proxy
configuration survivable.

