---
id: FEAT-0265
title: Exclude lazily consumed vendor chunks from the service-worker precache
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: pwa
data_class: none
adr: none
depends_on: [FEAT-0257]
---

# FEAT-0265 — Exclude lazily consumed vendor chunks from the service-worker precache

## Problem

`src/service-worker.ts` builds a precache list (`ASSETS`, ~L33;
`addFilesToCache()` ~L40; `cache.addAll(ASSETS)` ~L42). If `ASSETS` enumerates
all versioned build files, install-time `addAll` fetches **every** immutable
chunk — including the lazily loaded vendor chunks from FEAT-0257 (three.js) and
FEAT-0259/0260 payloads — on every deploy, for every user, negating much of
those wins on repeat visits. A runtime cache (`RUNTIME_CACHE` with
`MAX_RUNTIME_CACHE_ENTRIES`) already exists for non-precached responses.

Evidence basis: mechanism verified in code; the exact generated `ASSETS`
contents were **not** audited yet. Est. saving ~130–150 KB gzipped per deploy
for users who never enable effects (Architect review, 2026-08-23).

## Proposal

After FEAT-0257 lands, exclude lazily-consumed vendor chunks from the precache
list and rely on the existing runtime cache. Offline-start behavior must stay
intact — offline is a product feature of this local-first app.

## Acceptance criteria

- [ ] Precache list excludes documented lazy vendor chunks (exclusion list
      written down in the PR).
- [ ] A repeat visit after a deploy does not re-download excluded chunks
      (devtools/network evidence).
- [ ] Offline start still works for previously cached content; missing lazy
      chunks degrade gracefully (no broken white screen).
- [ ] Offline banner / PWA start unaffected.
- [ ] `npm run check` passes.

## Out of scope

- Service-worker architecture rewrite or cache-versioning strategy changes.

## Open questions

- Audit how `ASSETS` is generated before sizing the exclusion list — the
  premise needs confirmation against the real asset manifest.

## Links

- `src/service-worker.ts`
- Depends on: FEAT-0257 (lazy three.js)
- Source: Autonomous Optimization Architect review, 2026-08-23.
