---
id: FEAT-0265
title: Cache lazily loaded chunks on first use instead of precaching them
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: pwa
data_class: none
adr: none
depends_on: []
assignee: claude
branch: feature/feat-0265-sw-runtime-cache
---

# FEAT-0265 — Cache lazily loaded chunks on first use instead of precaching them

## Problem

Every deploy makes every user's browser download the whole app again, including
2.6 MiB of code most users never open.

`src/service-worker/index.ts` assembles the precache from all `immutable` chunks
plus every file in `static/`, and `install` fetches the entire list through
`cache.addAll`. `CACHE = cache-${version}` and every deploy ships a new
`version`, so that download happens once per release, per user. The full
payload breakdown (337 paths, 18.24 MiB) is in [FEAT-0775](FEAT-0775-precache-payload-fonts-static.md).

Inside it, 2.6 MiB is reachable only through a dynamic import:

- three.js in three files — `chunks/D50ODbxi.js` (540 KiB raw / 133 KiB gzip),
  `workers/galaxy.worker-*.js` (527 KiB / 129 KiB gzip),
  `workers/tradeFlow.worker-*.js` (585 KiB / 143 KiB gzip): 1.61 MiB raw /
  ~405 KiB gzip;
- `ammo/` (1.00 MiB), loaded when the stress calculation first runs
  (`src/lib/physics/StressLogic.ts`).

The three.js files sit behind the effect settings and the FX event store (both
off by default); `ammo/` behind the stress path. Neither group is on the
startup path.

Evidence basis: path list inlined in `.svelte-kit/output/client/service-worker.js`,
sizes from `stat` on those files, `develop` build of 2026-10-28. The build is
not pinned — re-measure in the PR.

## Proposal

1. Narrow `ASSETS` with a documented exclusion list. Keep the shape that
   `src/serviceWorkerPrecache.test.ts` pins: a flat `string[]` of `asset(...)`
   values, still matched with `includes(url.pathname)`. The exclusion narrows
   the finished list; it does not change how the list is built.
2. Add the on-demand cache that `docs/TODO.md` §13 removed, on that entry's own
   stated condition: *"Runtime caching can be added deliberately if a concrete
   offline use case appears."* The use case: an effect used once stays
   available offline.

   Parameters are fixed here so the implementer does not have to invent a
   cache policy:

   - one `RUNTIME_CACHE`, **not** version-keyed, so entries survive a deploy;
   - scope: `_app/immutable/*` and `/ammo/*` only;
   - bound: 50 entries, FIFO eviction in `cache.keys()` insertion order;
   - `deleteOldCaches()` must spare it — the shape the deleted code already had.

3. If the lazy import cannot be satisfied offline, the effect toggle stays
   operable and reports that state, instead of mounting an empty canvas.

## Result

Landed. The precache leaves out the three.js vendor chunk, both three.js
workers and `ammo/`; the service worker caches them on first use in
`runtime-lazy`, which a deploy does not delete.

**Finding the files.** Kit enforces `chunkFileNames`, so the three.js chunk is
`chunks/<hash>.js` with no readable name and a hand-written list would go stale
with the next dependency bump. `src/config/lazyPrecache.ts` is a Vite plugin
that reads the client bundle — the rolldown group name `three-vendor` survives
as `chunk.name`, the workers keep their `<entry>.worker-` prefix — and serves
the list to the service-worker build as `virtual:cachy-lazy-precache`. Kit
builds the service worker after the client, so the list is complete when it is
read. The build fails instead of shipping a quieter list when the group
disappears, when no three.js worker is found, or when an entry chunk reaches
`three-vendor` through static imports (that last one would make the offline
cold start depend on a file that was never cached). `ammo/` is two static
files and sits in `NOT_PRECACHED` by name.

**Runtime cache.** `src/service-worker/runtimeCache.ts`, with the parameters
the Proposal fixed: one `runtime-lazy` cache, not version-keyed; scope
`_app/immutable/*` and `/ammo/*` for paths outside the precache; 50 entries,
FIFO in `cache.keys()` order; `deleteOldCaches()` spares it. Entries are keyed
by pathname, as the precache already was. One addition the Proposal did not
spell out: a version-free cache is only safe for files that cannot change under
their name. `_app/immutable/*` is content-hashed; `ammo/` is not, so a hit on
it is served from the cache and refreshed in the background
(stale-while-revalidate) — otherwise an updated `ammo.wasm.js` would never
reach a user who had it cached, or would meet a newer `.wasm`.

**Offline reporting.** A missing chunk offline fails with the same browser
message as a chunk deleted by a deploy, so `handleLazyLoadFailure` used to
spend the tab's one stale-deployment reload on it. Offline it now shows a toast
(`offline.notCachedYet`, DE/EN) and does not reload; the `unhandledrejection`
path does the same. The galaxy and trade-flow backgrounds listen for their
worker's `error` event offline and drop the empty canvas; the FX overlay
reports a physics engine it could not load. The three overlay effects in the
root layout retry on the `online` event, so an effect switched on offline
loads once the connection is back without toggling it again.

### Sizes

Production build of 2026-11-23 on `develop` `b645f4c6b`, 1024-based:

| File | Raw | gzip -9 |
| --- | --- | --- |
| `_app/immutable/chunks/D50ODbxi.js` (`three-vendor`) | 540 KiB | 132 KiB |
| `_app/immutable/workers/galaxy.worker-DXTZWlr3.js` | 528 KiB | 128 KiB |
| `_app/immutable/workers/tradeFlow.worker-BhQ4baFC.js` | 585 KiB | 142 KiB |
| `ammo/ammo.wasm.js` | 385 KiB | 46 KiB |
| `ammo/ammo.wasm.wasm` | 636 KiB | 246 KiB |
| **total** | **2.61 MiB** | **694 KiB** |

| | before | after |
| --- | --- | --- |
| precache entries (plus `/`) | 353 | 348 |
| precache bytes | 10.87 MiB | **8.26 MiB** |

The hashes were identical across the three builds made for this item, so the
names above are what a reviewer's build should show too.

### What the browser checks showed

Headless Chromium against `node build/index.js`. Playwright's offline mode does
not reach fetches made by the service worker, and immutable chunks also sit in
the HTTP cache; "offline" below therefore means the context set offline **and**
the server stopped, in a fresh context that had never loaded three.js.

- Fresh install, effects and duck off: no request for any excluded path, from
  the page or from the install. The precache holds 349 entries and none of the
  five files; `technicals.worker` is still precached.
- Deploy: with three.js in `runtime-lazy`, a rebuilt version installed and
  activated, `cache-<old>` was deleted, `runtime-lazy` kept, and the chunk was
  served with `deliveryType: "cache-storage"`, `transferSize: 0`, no request
  from the service worker to the network.
- Used once online, then server down: the chunk comes back whole (553,211 bytes)
  from `runtime-lazy`.
- Burning Borders switched on offline without prior use: the toast appears,
  zero navigations (no reload), no page error, the switch stays on and
  operable, and switching it off and on reports again. Starting the server
  again loads the effect on the `online` event and puts the chunk into
  `runtime-lazy`.

Worth knowing: the duck companion is on by default, and `FXOverlay` initialises
it — and the physics engine — at mount. A new user with default settings
therefore loads three.js and `ammo/` on the first visit anyway. What changes for
them is that it happens once: the files survive every later deploy instead of
being downloaded again with each release.

## Acceptance criteria

- [x] The exclusion list is named in the PR with per-file sizes before and
      after.
- [x] A fresh install issues no network request for an excluded path (DevTools
      network log with the cache cleared).
- [x] A chunk cached on first use survives a deploy: after a new version
      activates, its hashed URL is served from `RUNTIME_CACHE` without a
      network request.
- [ ] Offline cold start after a fresh install still works for the app shell,
      Calculator and Journal. **Not attainable in this item:** an offline
      reload shows the error page on `develop` already, because the root
      layout's server load is fetched from `/__data.json` on every start. Same
      result with and without this change, reproduced on both builds — see
      [BUG-0836](../bugs/BUG-0836-offline-cold-start-fails-on-layout-server-data.md).
- [x] An effect enabled once while online stays usable offline afterwards.
- [x] An effect enabled while offline without prior use shows a defined
      message, no white screen, and no unhandled rejection in the console.
- [x] CI is green on `npm run check`; locally,
      `bash scripts/run-lowpri.sh npx vitest run --project=unit src/serviceWorkerPrecache.test.ts`
      passes.
- [x] No change to COEP, CSP or `Permissions-Policy`.

## Out of scope

- Fonts, PDFs and the rest of the `static` payload — that is
  [FEAT-0775](FEAT-0775-precache-payload-fonts-static.md). Both items edit the
  same `ASSETS` list, so land one before starting the other.
- De-duplicating three.js across the two workers (`galaxy.worker` and
  `tradeFlow.worker` each embed their own ~540 KiB copy). That is a bundling
  topic, not precache policy; it appears here only as a number.
- Service-worker architecture rewrite, and making `cache.addAll` resilient to a
  single failing asset — excluded paths never enter the list.

## Open questions

None. The offline policy was decided during grooming (2026-11-03): exclude from
the precache, cache on first use, degrade visibly when the chunk is
unavailable.

`adr: none` on purpose: `docs/TODO.md` §13 already records the policy and the
condition for revisiting it, and this item implements that condition rather
than changing the policy. The cache parameters that a reviewer would otherwise
have to guess are pinned in the Proposal.

## Links

- `src/service-worker/index.ts` (previously `src/service-worker.ts`)
- `src/serviceWorkerPrecache.test.ts` — pins the precache-list shape
- `docs/TODO.md` §13 — why the runtime cache was removed, and when to revisit
- [FEAT-0257](FEAT-0257-lazy-load-threejs-effect-overlays.md) — created the
  lazy three.js chunks this item stops precaching
- [FEAT-0775](FEAT-0775-precache-payload-fonts-static.md) — the font/static half
  of the precache payload
- Source: Autonomous Optimization Architect review, 2026-08-23.
