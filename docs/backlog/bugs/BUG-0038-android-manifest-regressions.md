---
id: BUG-0038
title: PWA splash screen, screenshots and long-press shortcuts regressed on Android
type: bug
status: in-progress
priority: P2
milestone: none
editions: [community, pro, private]
area: pwa
data_class: none
adr: none
depends_on: []
---

# BUG-0038 — PWA splash screen, screenshots and long-press shortcuts regressed on Android

## Symptom

Three things that used to work on an installed Android PWA no longer do:

1. the **splash-screen background** when launching the installed app,
2. the **screenshots** in the install dialog,
3. the **context menu** when long-pressing the app icon on the home screen.

Reported by the maintainer as a regression — these worked at some point and
broke since.

**Correction to an earlier wrong diagnosis.** An earlier pass on this item
claimed a missing `maskable` icon was "wrong and ruled out," reasoning only
that the existing icon files were valid PNGs at the declared sizes. That
reasoning was too narrow — file validity says nothing about whether `purpose`
is the right value for what Android does with it — and it was made without
consulting the file's real commit history (blocked at the time by this
working copy's shallow clone). Pulling that history via the GitHub API
instead of local `git log` (see Evidence) turned up two commits from
2026-01-07, an hour apart, both titled around fixing this exact white-splash
symptom, with **opposite** changes to the same field:

- `13bd66c` (21:44) added `"purpose": "any maskable"` to both icons, message:
  "resolving the issue where a white card was displayed."
- `10ce353` (22:51) reverted it to `"purpose": "any"`, message: "Using
  maskable for transparent icons was causing Android to render a white
  background on the splash screen."

Neither commit shows evidence of on-device verification — both are
plausible-sounding, contradictory, and from the same bot within the same
hour. The current manifest has carried the *reverted* value (`"any"` only)
ever since, through every later change, and the white splash is still being
reported today. So this was never actually settled either way; it was
dropped. See Fix below for what this pass did with that.

## Evidence

`git log` in this working copy cannot settle when this broke: it is a
**shallow clone** (`git rev-parse --is-shallow-repository` → `true`), and
`static/manifest.json` appears as "new file" in every commit that touches it
with zero modification-diffs — an artefact of the shallow history, not real
history. Two direct attempts to deepen it (`git fetch --unshallow`, then a
bounded `--depth=1000`) both timed out against this environment's sandboxed
network.

**What worked instead: the GitHub API has the full history regardless of the
local clone's depth.** `list_commits` with `path=static/manifest.json`
against the real repo returned the file's entire history back to its
creation (`e82b1bc`, 2026-01-07), which is how the January maskable-icon
flip-flop above was found. Worth remembering for any future "shallow clone
blocks bisection" situation in this repo — the local clone was never the only
source of truth, just the default one.

The manifest's full history, oldest to newest, condensed:

| Date | Commit | What changed |
| --- | --- | --- |
| 2026-01-07 14:48 | `e82b1bc` | Manifest created |
| 2026-01-07 21:44 | `13bd66c` | Icons → `purpose: "any maskable"` ("fixes white splash") |
| 2026-01-07 22:51 | `10ce353` | Reverted to `purpose: "any"` ("maskable causes white splash") |
| 2026-01-11 17:12 | `d850d9a` | Renamed to `site.webmanifest` to force a re-fetch (same symptom, different attempted fix) |
| 2026-01-15 | `aa3e11f` | Renamed back to `manifest.json` (title: "PWA & UI Refinement") |
| 2026-02-09/10 | `7f40111`, `3dfe52a`, `40d36ce` | Screenshots and both shortcuts added |
| 2026-03-03 | `dd24b40` | `display_override` gains `window-controls-overlay` |
| 2026-08-02 | `d0d9158` | This item: mislabelled screenshots fixed, screenshots block disabled |
| 2026-08-07 | `0907d67` | This item: `window-controls-overlay` removed |

Notable: the white-splash symptom has **three separate "fix" attempts on
record before this one** (the two January `purpose` changes and the
`site.webmanifest` rename), spanning seven months, none confirmed as having
actually worked. That is the strongest evidence in this whole item that
whatever is wrong here is not obvious and has resisted more than one plausible
guess already — a reason for skepticism about any *new* single-change fix
too, this pass's included.

What *was* verified, by reading the real bytes rather than trusting filenames:

| File | Declared in manifest | Actually is |
| --- | --- | --- |
| `screenshots/dashboard.png` | `image/png`, 1920×1066 | PNG, 1920×1066 ✅ |
| `screenshots/journal.png` | `image/png`, 1920×1066 | PNG, 1920×1066 ✅ |
| `screenshots/mobile-dashboard.png` | `image/png`, 640×640 | **JPEG**, 640×640 ❌ |
| `screenshots/mobile-journal.png` | `image/png`, 640×640 | **JPEG**, 640×640 ❌ |

**Both mobile screenshots were JPEG files with a `.png` extension**, declared
`"type": "image/png"`. A browser validates each `screenshots` entry against
the resource it fetches and drops the ones that do not match — silently, with
no console error. With both `form_factor: "narrow"` entries invalid, there was
nothing left to show in the mobile install dialog. That accounts for symptom 2
directly.

Ruled out, from static analysis:

- **CSP** — `default-src: 'self'` covers `manifest-src` and `img-src: 'self'`
  covers the assets, so neither the manifest nor its images were blocked.
- **Wiring** — `src/app.html:85` links the manifest correctly; the service
  worker precaches everything in `static/`.
- **Icons on disk** — all six icon/favicon files are valid and match their
  declared sizes and types.
- **Icon transparency** — checked the actual alpha channel with Pillow, not
  just eyeballing the PNG: all four corners and the center of both
  `icon-192.png` and `icon-512.png` are `alpha=0`. The logo shape is the only
  opaque content (~24-26% of pixels); there is no baked-in white background
  masquerading as transparency.
- **`display_override`** — reduced to `["standalone"]` (removed the
  desktop-only `window-controls-overlay` entry) and this was **deployed and
  tested on-device on both `dev.cachy.app` and `cachy.app`, on a fresh install
  after a full Chrome storage wipe** (Settings → Apps → Chrome → Storage →
  Clear storage, not just cache) — identical white splash / no shortcuts on
  both. This is now a confirmed non-cause, not just an unconfirmed precaution.
- **Chrome's own installability check** — DevTools → Application → Manifest
  reports **no installability errors** on the current manifest. Only two
  expected warnings (no `wide`/no non-`wide` screenshot — screenshots are
  intentionally disabled, see Fix) and one informational note about
  `display-override` being unset (harmless, desktop-only feature suggestion).
  Chrome considers this manifest fully valid and installable.
- **Not a caching or stale-WebAPK artefact** — full Chrome storage wipe,
  fresh WebAPK install via the actual "Install app" menu item (not a plain
  bookmark-style "Add to Home screen"), tested on both domains, same result
  every time.
- **Not domain/deploy-specific** — identical behaviour on `dev.cachy.app`
  (beta, `noindex`) and `cachy.app` (production, indexable). Rules out a
  beta-subdomain infra quirk (e.g. the orphaned `static/robots-subdomain.txt`,
  which is not wired to be served anywhere in this codebase and remains
  unexplained but is now known not to matter here).
- **Not browser-specific** — also reproduced in Brave (Chromium-based) on the
  same device, not just Chrome.

Symptoms 1 (splash) and 3 (shortcuts) are **still not explained** by anything
above — every criterion Chrome itself checks passes, and the symptom persists
anyway. That gap is exactly why the January `purpose` history (see Symptom
and Fix) is the most promising lead left: it is the one manifest field this
item had not actually tried changing yet, despite two unverified attempts
already existing in the file's history.

## Fix

**Done in this pass:**

- Renamed the two mislabelled files to `.jpg` and corrected their manifest
  entries to `"type": "image/jpeg"`. Re-encoding to real PNGs was not possible
  here (no image tooling available in the environment) and is not necessary —
  JPEG is a valid screenshot format; the defect was the false declaration, not
  the format.
- `src/tests/manifest_assets.test.ts` now reads the magic bytes of every image
  the manifest declares — icons, screenshots, shortcut icons — and asserts the
  real format and dimensions match what is claimed. This class of defect
  cannot return silently; nothing in the build would otherwise notice, since a
  manifest is only JSON to the bundler.
- **Screenshots disabled at the maintainer's request**: the `screenshots` key
  is removed from the manifest, so the install dialog uses its basic form. The
  four image files are kept in `static/screenshots/` — re-enabling is
  re-adding the key. The test validates the block if it returns and skips it
  while absent.
- `display_override` is now `["standalone"]` — `window-controls-overlay`
  removed. **Confirmed not the cause** (see Evidence): deployed and tested
  on-device on both domains after a full Chrome storage wipe, symptom
  unchanged. Kept anyway since it's still correct — Android was never going to
  use a desktop-only entry — but it is not what's blocking symptoms 1 and 3.
- **Added a proper `maskable` icon pair**, `icon-192-maskable.png` and
  `icon-512-maskable.png`, declared as new `purpose: "maskable"` entries
  alongside the existing `purpose: "any"` ones (not replacing them — a
  manifest can and should carry both). This is deliberately *not* a repeat of
  either January attempt: those toggled `purpose` on the *same* icon file,
  which is transparent right up to all four edges (confirmed above) — using
  that file as-is for `maskable` gives Android nothing to mask *into* except
  its own default backing, which is the textbook cause of exactly this
  symptom (an OS-supplied background showing through, typically white, behind
  content that doesn't fill a safe zone). The new files are generated
  (`static/icon-512.png`/`icon-192.png` composited onto a solid
  `#0f172a` canvas — same as `background_color`/`theme_color` — at 66% scale,
  leaving the padding a maskable icon needs so aggressive OS masks don't clip
  the logo's radiating tick marks) rather than hand-drawn, and are covered by
  `manifest_assets.test.ts` the same as every other declared image, since the
  test reads `manifest.icons` generically. This is the strongest untried lead
  in the item's history — see the January flip-flop above — but it is still
  **unverified on a real device** as of this writing.

**Still open:**

- Root-cause symptoms 1 and 3 (splash background, long-press shortcuts) on a
  real device with the new maskable icons. Needs on-device verification —
  three prior "fix" attempts for the white splash specifically (two in
  January, one in this pass before the maskable icons) did not resolve it, so
  treat this one with the same skepticism until confirmed.
- If the maskable icons don't fix it either: the remaining candidates are (a)
  something genuinely platform-side (see the Chromium/community bug reports
  gathered during this pass — Chrome on Android has open, unresolved reports
  of installed PWAs ignoring `background_color`/`theme_color` independent of
  manifest correctness), or (b) something this item hasn't found yet. Chrome's
  own installability check passing with zero errors, combined with three
  independent failed fix attempts across seven months, makes (a) look
  increasingly plausible — recorded here so the next pass doesn't have to
  re-derive it.
- If screenshots are wanted back, produce real PNGs at a portrait aspect ratio
  rather than the current 640×640 squares, which are an odd shape for a phone
  install dialog.

## Acceptance criteria

- [x] No manifest entry declares a type or size its file does not have
- [x] A test fails if that regresses
- [x] Screenshots are disabled without breaking the manifest or the test suite
- [x] `display_override`'s desktop-only entry removed — confirmed on-device
      not to be the cause, kept as a correctness fix regardless
- [x] A properly safe-zone-padded `maskable` icon pair added, addressing the
      gap an earlier pass in this item wrongly ruled out
- [ ] The splash screen shows `background_color` on a real Android device —
      verified on-device and the device/launcher noted here
- [ ] Long-pressing the installed icon shows both declared shortcuts —
      verified on-device

## Links

- `static/manifest.json`, `static/screenshots/`, `static/icon-*-maskable.png`,
  `src/app.html`
- `src/tests/manifest_assets.test.ts` — the guard added here
