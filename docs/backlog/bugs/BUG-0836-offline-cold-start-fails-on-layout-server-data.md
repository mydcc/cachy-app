---
id: BUG-0836
title: Offline cold start shows the error page because the root layout loads server data
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: pwa
data_class: none
adr: none
depends_on: []
---

# BUG-0836 — Offline cold start shows the error page because the root layout loads server data

## Symptom

With the service worker installed and the network gone, reloading the app
shows "Something went wrong — An unexpected error occurred" instead of the
Calculator and the Journal. The app shell itself comes from the cache; the
page dies right after.

## Evidence

**Demonstrated**, 2026-11-23, on a production build of `develop` at
`b645f4c6b` (`npm run build`, `node build/index.js`), in headless Chromium:

1. Fresh browser context, load `/` online, wait until the service worker
   controls the page and its install has finished.
2. Stop the server and set the context offline (both are needed — Playwright's
   offline emulation does not reach fetches made by the service worker).
3. Reload.

Result: the error page, no `input` on the page. The console shows
`Failed to load resource: net::ERR_FAILED @ /__data.json?x-sveltekit-trailing-slash=1&x-sveltekit-invalidated=1`
followed by `Client Hook Error: TypeError: Failed to fetch`.

The FEAT-0265 branch shows exactly the same result, so it is not caused by
the lazy-chunk change.

## Cause

`src/routes/+layout.server.ts` sets `ssr = false` and exports a server `load`.
Without SSR the HTML carries no data, so the client fetches the server load's
result from `/__data.json` on every start. The service worker never caches that
response — it caches `ASSETS` and `/` only — so offline the fetch fails and
the root layout's load error renders the error page.

The load returns one value, `INITIAL_TRADE_STATE`, which is a constant
imported from `src/stores/trade.svelte.ts`. Nothing about it needs the server.

When this started is not established: the file's only commit in `git log` is
a release squash (`42abdb9b3`, 2026-10-13). FEAT-0775 recorded the offline cold
start as working on 2026-11-07; whether that check covered a reload with the
server unreachable is not recorded.

## Fix

Move the value out of a server load: either a universal `+layout.ts` load, or
import `INITIAL_TRADE_STATE` where it is consumed and delete
`+layout.server.ts`. Keep `ssr = false` and `prerender = false` where they are
needed. Do not teach the service worker to cache `__data.json` — that would
cache per-request server data and hide the next server load that sneaks in.

## Acceptance criteria

- [ ] An offline reload with the service worker installed and the server
      unreachable shows the Calculator and the Journal (reproduction above).
- [ ] No request to `__data.json` on a normal start (DevTools network log).
- [ ] Whatever consumed `data.initialTradeState` gets the same value as before.

## Out of scope

- Market data, exchange connectivity and anything else that needs the network
  offline — they are expected to fail and already say so.
- Caching policy of the service worker (FEAT-0265, FEAT-0775).

## Links

- `src/routes/+layout.server.ts`
- `src/service-worker/index.ts`
- [FEAT-0265](../features/FEAT-0265-sw-precache-exclude-lazy-chunks.md) — found
  while verifying its offline acceptance criterion
