---
id: BUG-0789
title: Several client and proxy fetches have no deadline, and reconnect backoff has no jitter
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: market
data_class: C
adr: ADR-0004
depends_on: []
assignee: opencode
branch: fix/timeouts-and-jitter
---

# BUG-0789 — Missing upstream deadlines and backoff jitter (PA-11/13/14/15)

## Symptom

- **PA-11:** the reconnect backoff (`* 1.5`, capped at `MAX_BACKOFF_DELAY`) had
  no jitter, so every client reconnected on the same millisecond after an
  outage and spiked the venue exactly when it recovered.
- **PA-13:** the mark-price kline fetch had no deadline; a half-open link kept
  `inFlight` set for that symbol/timeframe, so `ensure()` never retried.
- **PA-14:** both news upstream fetches (CryptoPanic, NewsAPI) ran without a
  deadline while the other proxy routes used `fetchWithTimeout`.
- **PA-15:** the AI model list, the Ollama tag probe and the ImgBB upload had
  no deadline, so the settings panel or the journal spinner could wait forever.

## Evidence

Derived when filed; demonstrated by the tests added with the fix — each one
fails against the pre-fix code and names the behaviour it pins:

- jitter: `bitunixWs_private_backoff.test.ts` / `bitgetWs.v2.test.ts`, red when
  `jitteredDelay` is made an identity function (`expected 1000 to be 800`)
- news 504 + single attempt: `news_security.test.ts`, red before the route
  propagated the status (`expected 500 to be 504`) and retried all three plans
- signal attached: `markCandleCache.test.ts`, `news_security.test.ts`,
  `aiModelsService.test.ts`, `imgbbService.test.ts`

## Cause

Each call site used bare `fetch`, which has no deadline (`fetchWithTimeout` and
its 8 s budget existed but were only rolled out to the venue routes, BUG-0267).
`scheduleReconnect` advanced `backoffDelay` and waited exactly that value, so
all clients fired on the same tick.

## Fix

- One shared `jitteredDelay(delay, max)` (`src/utils/backoff.ts`): ±20 % factor,
  capped **after** jitter so `MAX_BACKOFF_DELAY` stays a real ceiling — the same
  order `retryPolicy.ts` uses. Both venues call it and log the jittered wait
  instead of the nominal one.
- `AbortSignal.timeout` on the mark kline fetch (30 s — above the route's own
  3 × 8 s retry budget, so the browser does not abort a response the server is
  still assembling). A timeout has no `status`, so it takes the cache's
  transient branch and can never be recorded as "venue does not support mark
  candles".
- Both news upstreams go through `fetchWithTimeout` with the per-event `fetch`.
  A timeout is no longer retried as "wrong CryptoPanic plan", and the route
  answers `504` instead of flattening it into a generic `500`.
- Deadlines on the AI model list (10 s, **both** transports — the server proxy
  is the default and had none), the Ollama probe (5 s, now logged before the
  fallback) and the ImgBB upload (60 s, room for a multi-MB screenshot).

## Acceptance criteria

- [x] Removing the jitter turns both venue tests red
- [x] Jitter never exceeds the documented backoff cap
- [x] A hung news upstream yields one request and a `504`, not three and a `500`
- [x] The mark kline fetch, the news upstreams, the AI model list and the ImgBB
      upload each carry an abort signal
- [x] A failed Ollama probe is logged instead of swallowed

## Out of scope

- Translating a timeout into a localized user-facing sentence in
  `AiModelPicker` / `JournalContent`. Both surfaces already show the error and
  clear their loading state; only the wording is a raw engine string.
- A per-request `request.signal` wiring so the kline route stops retrying after
  the browser has aborted.
- The visible cancel affordance PA-15 also mentioned — already present via the
  existing error state.

## Links

- Production audit `w3-production`, 2026-11-03 (commit `3e835a58`), PA-11,
  PA-13, PA-14, PA-15
- `src/utils/backoff.ts`, `src/utils/server/fetchWithTimeout.ts`
- BUG-0267 — the timeout helper and its 8 s budget
- ADR-0004 (mark klines and news are Class C)
