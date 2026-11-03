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

`src/service-worker/index.ts` precaches every entry of `$app/manifest` on
`install`: all `immutable` chunks plus every file in `static/`. Measured on the
`develop` build of 2026-10-28 that is **337 paths / 18.24 MB raw**:

| Category | Size |
| --- | --- |
| `fonts` | 6.44 MB |
| `_app/immutable/chunks` | 4.19 MB |
| `static` (other) | 2.18 MB |
| `_app/immutable/assets` (CSS) | 1.29 MB |
| `_app/immutable/workers` | 1.14 MB |
| `ammo` | 1.00 MB |
| `.pdf` | 0.87 MB |
| `wasm` | 0.76 MB |
| `_app/immutable/nodes` | 0.36 MB |

Because `CACHE = cache-${version}` and every deploy ships a new `version`,
`install` issues all 337 requests again per release, per user.

Among those entries are bundles that are reachable **only** through dynamic
imports:

- three.js, in three separate precached files — `chunks/D50ODbxi.js`
  (540 KB raw / 135 KB gzip), `workers/galaxy.worker-*.js`
  (528 KB / 131 KB gzip), `workers/tradeFlow.worker-*.js` (585 KB / 144 KB
  gzip): **1.65 MB raw / ~410 KB gzip**;
- `ammo/` (1.00 MB), loaded only from `src/lib/physics/StressLogic.ts`.

Both groups are effect-only. A user who never enables a visual effect still
downloads 2.65 MB of them on every deploy.

Evidence basis: measured from `.svelte-kit/output/client/service-worker.js`
(the literal path array SvelteKit inlines into the built worker) plus file
sizes, 2026-10-28. Re-measure before quoting these numbers in a release note —
the build is not pinned.

## Proposal

1. Subtract a documented exclusion list from `ASSETS`. The filter is appended
   **after** `map(asset(…))`, so `const ASSETS: string[]`,
   `ASSETS.includes(url.pathname)` and both `map(…) => asset(…)` shapes that
   `src/serviceWorkerPrecache.test.ts` pins stay intact.
2. Add an on-demand cache for `_app/immutable/*` with an entry bound, so a
   chunk used once is available offline afterwards. This deliberately revives
   the `RUNTIME_CACHE` that was removed on 2026-09-08 (`docs/TODO.md` §13) —
   that entry ends with *"Runtime caching can be added deliberately if a
   concrete offline use case appears"*, and the use case is now named: lazy
   effect chunks must survive an offline session after first use. Scope it to
   build assets; do not resurrect the general-purpose runtime cache.
3. Define the failure path: if the lazy import cannot be satisfied offline, the
   effect toggle stays operable and reports the state instead of mounting an
   empty canvas.

## Acceptance criteria

- [ ] The exclusion list is named in the PR with file and byte counts before
      and after.
- [ ] A repeat visit after a deploy does not re-download the excluded chunks
      (DevTools network evidence in the PR).
- [ ] Offline cold start after a fresh install still works for the app shell,
      Calculator and Journal (evidence in the PR).
- [ ] An effect enabled once while online stays usable offline afterwards
      (on-demand cache proven).
- [ ] An effect enabled while offline without prior use shows a defined
      message, no white screen, and no unhandled rejection in the console.
- [ ] `npm run check`, `npm run check:sw` and
      `src/serviceWorkerPrecache.test.ts` pass.
- [ ] No change to COEP, CSP or `Permissions-Policy` (metaverse/iframe rules in
      `AGENTS.md`).

## Out of scope

- Fonts, PDFs and the rest of the `static` payload — that is FEAT-0775, larger
  and orthogonal to offline semantics.
- De-duplicating three.js across the two workers (`galaxy.worker` and
  `tradeFlow.worker` each embed their own ~540 KB copy). That is a bundling
  topic, not precache policy; it appears here only as a number.
- Service-worker architecture rewrite, cache-versioning strategy, and making
  `cache.addAll` resilient to a single failing asset.

## Open questions

None. The offline policy was decided during grooming (2026-11-03): exclude from
precache, cache on first use, degrade visibly when the chunk is unavailable.

## Links

- `src/service-worker/index.ts` (previously `src/service-worker.ts`)
- `src/serviceWorkerPrecache.test.ts` — pins the precache-list shape
- `docs/TODO.md` §13 — why the runtime cache was removed, and when to revisit
- [FEAT-0257](FEAT-0257-lazy-load-threejs-effect-overlays.md) — created the
  lazy three.js chunks this item stops precaching
- [FEAT-0775](FEAT-0775-precache-payload-fonts-static.md) — the font/static half
  of the precache payload
- Source: Autonomous Optimization Architect review, 2026-08-23.
