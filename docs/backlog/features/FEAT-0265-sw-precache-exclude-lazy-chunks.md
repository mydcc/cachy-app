---
id: FEAT-0265
title: Cache lazily loaded chunks on first use instead of precaching them
type: feature
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: pwa
data_class: none
adr: none
depends_on: []
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

## Acceptance criteria

- [ ] The exclusion list is named in the PR with per-file sizes before and
      after.
- [ ] A fresh install issues no network request for an excluded path (DevTools
      network log with the cache cleared).
- [ ] A chunk cached on first use survives a deploy: after a new version
      activates, its hashed URL is served from `RUNTIME_CACHE` without a
      network request.
- [ ] Offline cold start after a fresh install still works for the app shell,
      Calculator and Journal.
- [ ] An effect enabled once while online stays usable offline afterwards.
- [ ] An effect enabled while offline without prior use shows a defined
      message, no white screen, and no unhandled rejection in the console.
- [ ] CI is green on `npm run check`; locally,
      `bash scripts/run-lowpri.sh npx vitest run --project=unit src/serviceWorkerPrecache.test.ts`
      passes.
- [ ] No change to COEP, CSP or `Permissions-Policy`.

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
