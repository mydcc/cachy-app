---
id: BUG-0789
title: Remaining upstream fetches have no timeout, and reconnect backoff has no jitter
type: bug
status: in-progress
priority: P3
milestone: none
editions: [community, pro, private]
area: market
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/timeouts-and-jitter
---

# BUG-0789 — Upstream timeouts and backoff jitter (PA-11/PA-13/PA-14/PA-15)

## Symptom

- **PA-11:** reconnect backoff (`* 1.5`, capped at 30 s) has no jitter, so all
  clients reconnect in lockstep after a venue outage.
- **PA-13:** the mark-price kline fetch has no timeout; `inFlight` stays set
  until the browser gives up.
- **PA-14:** the two news upstream fetches (CryptoPanic, NewsAPI) run without a
  timeout while 16 other proxy routes use `fetchWithTimeout`.
- **PA-15:** the AI model list, Ollama tag probe and ImgBB upload have no
  timeout, so the UI can spin indefinitely.

## Evidence

Derived — `src/services/bitunixWs.ts`, `src/services/bitgetWs.ts`,
`src/services/alertEngine/markCandleCache.ts`,
`src/routes/api/external/news/+server.ts`, `src/services/aiModelsService.ts`,
`src/services/imgbbService.ts`. Production audit PA-11/PA-13/PA-14/PA-15.

## Fix

- ±20 % jitter on both venues' reconnect delays.
- `AbortSignal.timeout(10_000)` on the mark kline fetch.
- `fetchWithTimeout(…, DEFAULT_UPSTREAM_TIMEOUT_MS, fetch)` on both news
  upstreams (the per-event fetch is passed through).
- `AbortSignal.timeout` on the AI model list (10 s), Ollama probe (5 s) and
  ImgBB upload (30 s).

## Verification

Existing suites for the WS backoff, mark cache, news route, AI models and
ImgBB are green. The backoff test pins `Math.random` to 0.5 so the ±20 %
jitter does not make the exact timer advances flaky.
