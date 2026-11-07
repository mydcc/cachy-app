---
id: FEAT-0775
title: Cut the service-worker precache payload — fonts and static files
type: feature
status: in-progress
priority: P3
milestone: none
editions: [community, pro, private]
area: pwa
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: feature/feat-0775-font-subset
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

## Result

Landed. `scripts/subset-fonts.sh` regenerates the files from a Google Fonts
download and documents the ranges, the feature list and the fontTools version;
the repository ships only the result, next to the unchanged `OFL.txt` and
`README.txt`.

| Face | TTF | WOFF2 | |
| --- | --- | --- | --- |
| `Inter-Italic-VariableFont_opsz,wght` | 883 KiB | 128 KiB | −86% |
| `Inter-VariableFont_opsz,wght` | 854 KiB | 116 KiB | −86% |
| `SourceSans3-VariableFont_wght` | 627 KiB | 47 KiB | −92% |
| `NunitoSans-VariableFont_YTLC,opsz,wdth,wght` | 556 KiB | 99 KiB | −82% |
| `NunitoSans-Italic-VariableFont_YTLC,opsz,wdth,wght` | 543 KiB | 107 KiB | −80% |
| `IBMPlexSans-VariableFont_wdth,wght` | 520 KiB | 76 KiB | −85% |
| `JetBrainsMono-VariableFont_wght` | 185 KiB | 43 KiB | −77% |
| `SchibstedGrotesk-Italic-VariableFont_wght` | 178 KiB | 54 KiB | −70% |
| `RobotoMono-VariableFont_wght` | 177 KiB | 42 KiB | −76% |
| `SchibstedGrotesk-VariableFont_wght` | 173 KiB | 50 KiB | −71% |
| `Manrope-VariableFont_wght` | 163 KiB | 30 KiB | −82% |
| `SpaceGrotesk-VariableFont_wght` | 131 KiB | 30 KiB | −77% |
| `RedHatDisplay-Italic-VariableFont_wght` | 97 KiB | 36 KiB | −63% |
| `RedHatDisplay-VariableFont_wght` | 95 KiB | 34 KiB | −64% |

**6.44 MiB → 0.87 MiB.** The largest file went from 883 KiB to 128 KiB. All
fourteen keep their variable axes, so the `@font-face` weight ranges and
`font-optical-sizing` behave as before. The four unreferenced italics are
deleted (1.32 MiB of bytes no browser ever requested).

Subset: latin + latin-ext, plus the OpenType features a UI can reach — `ccmp`,
`locl`, `kern`, `liga`, `clig`, `calt`, `case`, `tnum`, `zero`. The stylistic
sets (`ss01`–`ss08`, `cv01`–`cv14`, `salt`, `aalt`) are dropped: nothing in
`src/` sets `font-feature-settings` or `font-variant-alternates`, so no code
path can request them. `tnum` stays because tables and price fields use
`font-variant-numeric: tabular-nums`.

Precache, measured on the production build of 2026-11-07:

| | before | after |
| --- | --- | --- |
| precache entries | 341 | 336 |
| precache bytes | 18.24 MiB (2026-10-28 baseline) / 12.87 MiB with the new fonts in place | **10.59 MiB** |
| font bytes | 6.44 MiB | **0.87 MiB** |

### The four largest remaining `static` files

| File | Size | Decision |
| --- | --- | --- |
| `wasm/technicals_wasm_bg.wasm` | 741 KiB | **Precached.** Every indicator runs through it; the Calculator is the reason the app has an offline mode. |
| `ammo/ammo.wasm.wasm` | 636 KiB | **Precached for now.** Only the stress calculation needs it, and dropping it is FEAT-0265's decision, not this item's. |
| `knowledge/setups/Dolphin Strategy PDF.pdf` | 566 KiB | **Removed from the precache.** No link to `knowledge/` exists in `src/`. |
| `twitter-image.jpg` | 481 KiB | **Removed from the precache.** Social preview only, referenced from `<meta>`; `og-image.jpg` and `seo-banner.png` are byte-identical copies and are removed with it. |

The exclusion lives in the service worker as `NOT_PRECACHED`, applied to the
assembled list. `src/serviceWorkerPrecache.test.ts` ties every entry to a file
that exists under `static/` — a typo would otherwise exclude nothing and no one
would notice. Both PDFs were also cached under a key the fetch handler could
never match: `url.pathname` reports spaces percent-encoded while `asset()`
returns them raw.

## Acceptance criteria

- [x] No `.ttf` under `static/fonts/`; every `@font-face` and the `src/app.html`
      preload resolve to a `.woff2` that exists.
- [x] Total font bytes in the precache ≤ 2.0 MiB (baseline 6.44 MiB) **and** no
      single font file above 170 KiB — plain re-encoding alone gets near 2.1
      MiB, so the second bound is what proves the subsetting step. Per-file
      before/after table in the PR.
- [x] Glyphs come from the subset, observably: with the `.woff2` files blocked
      in DevTools the German `ä ö ü ß` and the latin-ext set (`ą ć ę ł ń ó ś ź
      ż`, `č š ž`) fall back, and with them unblocked DevTools names the
      `.woff2` as the winning face.
- [x] Offline cold start is unaffected: app shell, Calculator and Journal work
      with the network disabled.
- [x] Each of the four largest remaining `static` files is either justified in
      the PR as offline-relevant or removed from the precache.
- [x] No COEP, CSP or `Permissions-Policy` change.
- [x] CI is green on `npm run check`; locally,
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
