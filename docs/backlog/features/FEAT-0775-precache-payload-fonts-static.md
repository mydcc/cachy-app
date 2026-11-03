---
id: FEAT-0775
title: Cut the service-worker precache payload — fonts and static files
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

# FEAT-0775 — Cut the service-worker precache payload — fonts and static files

## Problem

`src/service-worker/index.ts` precaches every file in `static/` plus every
`immutable` chunk on `install`. On the `develop` build of 2026-10-28 that is
**18.24 MB raw across 337 paths**, and the largest single block is fonts:
**6.44 MB**, more than all JS chunks combined (4.19 MB).

Two things are wrong with that, and neither needs an offline-semantics
decision — these bytes are simply wasted:

1. **They are shipped as raw TrueType.** All 14 `@font-face` declarations in
   `src/app.css` use `format("truetype")`, and `static/` contains no `.woff2`
   at all. Every one of them is a full variable font with all its axes.
2. **Four files are not referenced by any `@font-face`** and are still
   precached, because the precache is the whole `static/` directory, not the
   set of used files:
   - `IBM_Plex_Sans/IBMPlexSans-Italic-VariableFont_wdth,wght.ttf` (584 KB)
   - `Source_Sans_3/SourceSans3-Italic-VariableFont_wght.ttf` (384 KB)
   - `JetBrains_Mono/JetBrainsMono-Italic-VariableFont_wght.ttf` (192 KB)
   - `Roboto_Mono/RobotoMono-Italic-VariableFont_wght.ttf` (192 KB)

   ≈ **1.35 MB** of bytes no browser will ever request.

Also in the precache: 0.87 MB of PDFs under `knowledge/` and 2.18 MB of other
`static` files, none of which has been audited against "does this need to be
available offline at all".

Evidence basis: measured from `.svelte-kit/output/client/service-worker.js`
and `static/` on 2026-10-28. `du`-rounded per directory; re-measure per file in
the PR.

## Proposal

1. Convert the 14 used variable fonts to **WOFF2** and subset them to
   `latin` + `latin-ext` (the app ships `de` and `en` only —
   `src/locales/locales/`). Keep the open-source licence files next to them.
2. Delete the four unreferenced italic files, or, if a design decision adds
   italics later, reference them in the same PR that adds the bytes.
3. Update the `@font-face` blocks in `src/app.css` to `format("woff2")`.
   Committed build artifacts are fine here — the repo already commits
   `static/wasm/` — but the generation command must be written down in the PR
   and reproducible (subsetting range, tool version).
4. Audit the remaining `static/` files: anything over ~100 KB either justifies
   being offline-available or leaves the precache.

## Acceptance criteria

- [ ] No `.ttf` under `static/fonts/`; every `@font-face` resolves to a
      `.woff2` that exists.
- [ ] Total font bytes in the precache ≤ 2.5 MB (baseline 6.44 MB), with a
      per-file before/after table in the PR.
- [ ] German `ä ö ü ß` plus latin-ext diacritics (`ą ć ę ł ń ó ś ź ż`,
      `č š ž`) render from the subset fonts — checked in the running app, not
      only in a font inspector.
- [ ] Offline cold start is unaffected: app shell, Calculator and Journal work
      with the network disabled.
- [ ] Every remaining `static` file above 100 KB is either justified in the PR
      as offline-relevant or removed from the precache.
- [ ] No COEP, CSP or `Permissions-Policy` change.
- [ ] `npm run check` and `src/serviceWorkerPrecache.test.ts` pass.

## Out of scope

- The lazy-chunk half of the precache (three.js, `ammo/`) and any change to
  offline semantics — that is FEAT-0265.
- Changing the font pairing, the type scale, or any design decision. This item
  only changes the file format and the glyph coverage, not which families are
  used.
- Self-hosting at the CDN edge, `font-display` policy changes, or a runtime
  font loader.
- Service-worker architecture, cache versioning.

## Open questions

- Which weights are actually used per family? The `@font-face` declarations
  carry a weight range; if the UI only uses a subset, narrowing the variable
  axis range shrinks the file further. Audit during implementation; if the
  answer is "all of them", the subsetting step alone carries the item.

## Links

- `src/app.css` — the 14 `@font-face` declarations
- `static/fonts/` — 16 `.ttf` files, 10 families
- `src/service-worker/index.ts`
- [FEAT-0265](FEAT-0265-sw-precache-exclude-lazy-chunks.md) — the other half of
  the same precache budget
- [FEAT-0257](FEAT-0257-lazy-load-threejs-effect-overlays.md) — why the lazy
  chunks exist at all
