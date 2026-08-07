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

**Note on an earlier wrong diagnosis.** The first version of this item claimed
the cause was a missing `maskable` icon. That is wrong and has been removed:
the icon masking is intended as it is, and the icon files were verified sound
(`icon-192.png` is a real 192×192 PNG, `icon-512.png` a real 512×512 PNG, both
RGBA). Recorded rather than quietly deleted, because "plausible cause, never
checked" is exactly what this repo's evidence rule exists to catch.

## Evidence

`git log` cannot settle when this broke: the working copy is a **shallow
clone** (178 commits, `git rev-parse --is-shallow-repository` → `true`), and
`static/manifest.json` appears as "new file" in every commit that touches it
with zero modification-diffs — an artefact of the shallow history, not real
history. No bisect was attempted for that reason; nothing here rests on a
claim about when the regression landed.

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

Ruled out while looking:

- **CSP** — `default-src: 'self'` covers `manifest-src` and `img-src: 'self'`
  covers the assets, so neither the manifest nor its images were blocked.
- **Wiring** — `src/app.html:85` links the manifest correctly; the service
  worker precaches everything in `static/`.
- **Icons** — all six icon/favicon files are valid and match their declared
  sizes and types.

Symptoms 1 (splash) and 3 (shortcuts) are **not explained** by the above. The
manifest fields they depend on are present and well-formed:
`background_color` and `theme_color` are both `#0f172a`, a ≥512px icon exists,
and two `shortcuts` entries are declared with valid icons. So the cause of
those two is still unknown, and this item does not pretend otherwise.

One untested suspicion worth checking first, recorded as a lead rather than a
finding: `display_override` was `["window-controls-overlay", "standalone"]`,
and `window-controls-overlay` is a desktop-only display mode listed ahead of
the one Android actually uses. Per spec a browser should skip an unsupported
value and fall through to `standalone`, so this *should* be harmless — but it
was the one field in the file whose first entry is inapplicable to the
platform where the symptoms appear, and it cost nothing to test with it
removed. `grep -rn "window-controls-overlay\|display_override" src` turned up
no CSS or JS depending on the WCO layout (no `titlebar-area-*` env() usage
anywhere), so removing it changes nothing else.

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
  removed. Nothing in the codebase reads a WCO-specific layout (checked via
  grep, see above), so this has no other effect either way. This is a
  precaution, not a confirmed fix: it has not been verified on-device, and a
  full `git log -p` to find what actually changed when the regression landed
  was attempted and is still not possible from this environment (`git fetch
  --unshallow` and a bounded `--depth=1000` deepen both timed out against the
  sandboxed network — not merely "no tooling," an actual attempt was made and
  failed). That step still needs a full clone.

**Still open:**

- Root-cause symptoms 1 and 3 (splash background, long-press shortcuts) on a
  real device, now that `display_override` no longer lists a desktop-only
  mode first. Needs on-device verification — nothing here confirms it fixed
  anything, only that it removes one plausible cause.
- If screenshots are wanted back, produce real PNGs at a portrait aspect ratio
  rather than the current 640×640 squares, which are an odd shape for a phone
  install dialog.

## Acceptance criteria

- [x] No manifest entry declares a type or size its file does not have
- [x] A test fails if that regresses
- [x] Screenshots are disabled without breaking the manifest or the test suite
- [ ] The splash screen shows `background_color` on a real Android device —
      verified on-device and the device/launcher noted here
- [ ] Long-pressing the installed icon shows both declared shortcuts —
      verified on-device
- [x] `display_override`'s desktop-only entry removed as a precaution (not yet
      confirmed as the actual cause — needs on-device verification, see above)

## Out of scope

Icon masking. It is intended as-is; see the note under Symptom.

## Links

- `static/manifest.json`, `static/screenshots/`, `src/app.html`
- `src/tests/manifest_assets.test.ts` — the guard added here
