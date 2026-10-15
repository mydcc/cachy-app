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
  once through the other path and remembers which path worked, so the cost is
  one failed attempt per process.
- The retry is deliberately narrow: never after the guard itself refused the
  dial (the proxy path does not resolve the target locally, so retrying there
  would tunnel past the decision the guard just made), and never for a body that
  cannot be sent twice (a stream).
- The direct path's lookup exempts nothing; the proxy exemption exists only on
  the proxy path.

## Verification

Five new tests in `urlValidator.test.ts` (each verified red without its fix):
the retry and its stickiness, the "no retry after a guard refusal" rule, the
"no retry of a stream body" rule, the second failure surfacing when neither path
works, and the direct path refusing the private proxy host. End-to-end against
the real module: a proxy that refuses `CONNECT` → recovers over the direct path;
a dead proxy → recovers; a live proxy → still used.
