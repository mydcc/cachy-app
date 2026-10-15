---
id: BUG-0689
title: AI routes answer 500 fetch failed because the guarded dispatcher adopts a dead egress proxy
type: bug
status: done
assignee: opencode
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
---

# BUG-0689 — AI routes answer 500 fetch failed because the guarded dispatcher adopts a dead egress proxy

## Symptom

Every `/api/ai/*` route answers `500 {"error":"fetch failed"}` on the staging
deployment, within ~0.2 s, for every provider and every host — including a plain
static host such as `example.com`. The AI chat and the model pickers are
unusable. Plain `fetch` to the same endpoints keeps working.

## Evidence

**Demonstrated** — observed live, and reproduced locally.

- `GET dev.cachy.app/api/ai/gemini/models` (dummy key) → `500 {"error":"fetch failed"}` in 0.17–0.24 s.
- The same route on the stable build, which has no custom dispatcher, → `400 "API key not valid"`, i.e. a real answer **from Google**: the host's direct egress works.
- Plain `fetch` in the same process (`/api/external/cmc`) → a real upstream answer (`401 This API Key is invalid`).
- Local reproduction with a dead proxy endpoint (`HTTPS_PROXY=http://127.0.0.1:9`): the previous dispatcher fails in 25 ms with `ECONNREFUSED`; a live local proxy keeps working, so only the dead case is wrong.

## Cause

A variation of this bug arrived in two steps, and the second one is the
regression this item records:

1. The dial-time guard handed undici the callback in the `(err, address, family)`
   shape while undici passes `{ all: true }`, so **every** dial failed with
   "fetch failed". Fixed in #4107 (`a98eb6dc6`).
2. The same PR also made the dispatcher adopt `HTTP_PROXY` / `HTTPS_PROXY` via
   `EnvHttpProxyAgent` whenever those variables were merely present. On a host
   where the variable is set but nothing answers on that endpoint, every guarded
   dial then went to a dead address. That is the state staging was in.

## Fix

`src/lib/server/urlValidator.ts` in #4114 (`fac4a9569`):

- `probeProxy()` — one short TCP connect (1 s) to the configured proxy when the
  dispatcher is built. Only an answering proxy is adopted; otherwise the direct,
  still-guarded `Agent` is used, with a single warning in the log.
- `describeFetchFailure()` — the dial-failure code (`ECONNREFUSED`, `ENOTFOUND`,
  `ConnectTimeoutError`, …) is appended to the thrown message, so a 500 from an
  AI route names its reason without server logs.

The guard itself is untouched: same pre-flight check, same dial-time
private-range rule, same proxy-address exemption pinned to resolved addresses.

## Verification

`urlValidator.test.ts` gained three tests (each verified red without its fix):
a dead proxy falls back to a direct Agent, a configured proxy is probed exactly
once, and the dial-failure code is named. `npx vitest run --project=unit
src/lib/server/urlValidator.test.ts src/routes/api/ai` → 10 files, 89 tests
pass. End-to-end against the real module: dead proxy → direct connection works,
live proxy → still used, no proxy variables → unchanged.

## Follow-up

The probe this item introduced only asked whether the proxy's port accepts a
connection, which is not the same question as whether the proxy can carry a
request. A proxy that answers TCP and refuses `CONNECT` slipped through and left
every guarded route broken again — see
[BUG-0690](BUG-0690-ai-egress-proxy-refuses-tunnel.md), which replaced the probe
with a per-request fallback between the two guarded paths.
