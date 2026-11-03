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

The precache is the whole `static/` directory plus every `immutable` chunk, and
`install` fetches all of it. On the `develop` build of 2026-10-28 that is **337
paths / 18.24 MiB**, refetched once per release because `CACHE` is keyed by the
build version:

| Category | Size (MiB) |
| --- | --- |
| `fonts` | 6.44 |
| `_app/immutable/chunks` | 4.19 |
| `static` (other) | 2.18 |
| `_app/immutable/assets` (CSS) | 1.29 |
| `_app/immutable/workers` | 1.14 |
| `ammo` | 1.00 |
| `.pdf` | 0.87 |
| `wasm` | 0.76 |
| `_app/immutable/nodes` | 0.36 |
| **total** | **18.24** |

Sizes are 1024-based, as `stat` reports them.

The largest block is fonts: **6.44 MiB, more than all the JavaScript in the
precache combined (5.70 MiB)**. Two things are wrong with it, and neither needs
an offline-semantics decision — the bytes are simply wasted:

1. **They ship as raw TrueType.** All 14 `@font-face` declarations in
   `src/app.css` use `format("truetype")`, and `static/` contains no `.woff2` at
   all. Every one is a full variable font with all its axes.
2. **Four files are referenced by no `@font-face`** and are precached anyway,
   because the list is the whole directory rather than the set of used files:
   - `static/fonts/IBM_Plex_Sans/IBMPlexSans-Italic-VariableFont_wdth,wght.ttf` (584 KiB)
   - `static/fonts/Source_Sans_3/SourceSans3-Italic-VariableFont_wght.ttf` (384 KiB)
   - `static/fonts/JetBrains_Mono/JetBrainsMono-Italic-VariableFont_wght.ttf` (192 KiB)
   - `static/fonts/Roboto_Mono/RobotoMono-Italic-VariableFont_wght.ttf` (192 KiB)

   ≈ **1.32 MiB** of bytes no browser will ever request.

PDFs under `knowledge/` (0.87 MiB) and other `static` files (2.18 MiB) are
precached too, and none of them has ever been checked for whether it needs to
be available offline.

Evidence basis: path list inlined in `.svelte-kit/output/client/service-worker.js`,
sizes from `stat` on those files, `develop` build of 2026-10-28. The build is
not pinned — re-measure in the PR.

## Proposal

1. Convert the 14 used variable fonts to **WOFF2** and subset them to `latin` +
   `latin-ext`: the app ships `de` and `en` only (`src/locales/locales/`). Keep
   the `OFL.txt` files next to them.
2. Delete the unreferenced italic files listed above — or, if a design decision
   adds italics later, reference them in the PR that adds the bytes.
3. Repoint every reference at the new files: the 14 `@font-face` blocks in
   `src/app.css` to `format("woff2")`, and the Inter preload in `src/app.html`
   (currently `/fonts/Inter/Inter-VariableFont_opsz,wght.ttf`,
   `type="font/ttf"`). Miss the preload and a fresh install 404s on it.
   Committed build artifacts are fine here — the repo already commits
   `static/wasm/` — but the generation command, the subsetting range and the
   tool version have to be written down in the PR so the result is
   reproducible.
4. Audit the four largest remaining `static` files: name each one with its size
   and one line on why it must work offline, or move it out of the precache.
   Anything smaller stays out of this item.

The `@font-face` weight ranges are a floor, not a target: if UI usage turns out
to be narrower than the declared range, tighten the axis and the files shrink
again. If it is not, subsetting alone carries the size target. Nothing blocks
the start either way.

## Acceptance criteria

- [ ] No `.ttf` under `static/fonts/`; every `@font-face` and the `src/app.html`
      preload resolve to a `.woff2` that exists.
- [ ] Total font bytes in the precache ≤ 2.0 MiB (baseline 6.44 MiB) **and** no
      single font file above 170 KiB — plain re-encoding alone gets near 2.1
      MiB, so the second bound is what proves the subsetting step. Per-file
      before/after table in the PR.
- [ ] Glyphs come from the subset, observably: with the `.woff2` files blocked
      in DevTools the German `ä ö ü ß` and the latin-ext set (`ą ć ę ł ń ó ś ź
      ż`, `č š ž`) fall back, and with them unblocked DevTools names the
      `.woff2` as the winning face.
- [ ] Offline cold start is unaffected: app shell, Calculator and Journal work
      with the network disabled.
- [ ] Each of the four largest remaining `static` files is either justified in
      the PR as offline-relevant or removed from the precache.
- [ ] No COEP, CSP or `Permissions-Policy` change.
- [ ] CI is green on `npm run check`; locally,
      `bash scripts/run-lowpri.sh npx vitest run --project=unit src/serviceWorkerPrecache.test.ts`
      passes.

## Out of scope

- The lazy-chunk half of the precache (three.js, `ammo/`) and any change to
  offline semantics — that is
  [FEAT-0265](FEAT-0265-sw-precache-exclude-lazy-chunks.md). Both items edit the
  same `ASSETS` list, so land one before starting the other.
- Changing the font pairing or the type scale. This item changes the file
  format and the glyph coverage, not which families are used.
- Serving fonts from a CDN instead of `static/`, `font-display` policy, or a
  runtime font loader.
- Service-worker architecture and cache versioning.

## Open questions

None blocking.

## Links

- `src/app.css` — the 14 `@font-face` declarations
- `src/app.html` — the Inter font preload
- `static/fonts/` — 18 `.ttf` files (14 referenced, 4 not), 10 families
- `src/service-worker/index.ts`
- [FEAT-0265](FEAT-0265-sw-precache-exclude-lazy-chunks.md) — the lazy-chunk
  half of the same precache budget
- [FEAT-0257](FEAT-0257-lazy-load-threejs-effect-overlays.md) — why the lazy
  chunks exist at all
