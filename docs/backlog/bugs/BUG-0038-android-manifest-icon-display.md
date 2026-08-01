---
id: BUG-0038
title: Installed PWA displays suboptimally on Android home screens
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

# BUG-0011 — Installed PWA displays suboptimally on Android home screens

## Symptom

The app, installed as a PWA on an Android device, does not display optimally
on the home screen — reported by the maintainer from direct use.

## Evidence

**The symptom is demonstrated** (maintainer observation on a real Android
device). **The specific cause below is derived**, not yet confirmed on-device
against the fix — recorded honestly per this repo's evidence discipline.

`static/manifest.json`'s `icons` array declares exactly two entries
(192×192, 512×512), both `"purpose": "any"` — **no `maskable` variant exists**.
Android's adaptive-icon system (Android 8+, and Chrome's install treatment on
Android generally) expects a maskable icon whose artwork sits inside a
centered ~66% "safe zone", because the OS/launcher applies its own mask shape
(circle, squircle, rounded square — varies by OEM and launcher) to whatever
icon it is given. Without a declared `maskable` purpose, treatment is
launcher-dependent: some pad the `any` icon onto a solid backdrop (which can
mismatch the device theme), others crop it directly against the mask.

Visually inspecting `static/icon-512.png` supports this as the likely
mechanism: the crosshair mark's four tick strokes extend to within a few
pixels of the image edge, well outside where a ~66% safe zone would fall. If
any launcher applies a circular or squircle mask to this artwork, the tick
marks are cut off.

Other candidate contributors, not yet ruled out — the manifest should get a
full pass rather than a single-field patch:

- `orientation: "portrait"` locks rotation; worth confirming this is
  intentional rather than a leftover default.
- `display_override` lists `window-controls-overlay` first, which is a
  desktop-only feature — harmless on Android but worth reordering for clarity.
- The `screenshots` array's referenced files
  (`static/screenshots/{dashboard,journal,mobile-dashboard,mobile-journal}.png`)
  exist, but their declared `sizes` should be spot-checked against the actual
  file dimensions — a mismatch there affects the install-prompt preview, not
  the home-screen icon, but is easy to check in the same pass.

## Cause

Most likely: absence of a maskable icon, combined with source artwork that
does not leave a safe zone. Not confirmed against a live device.

## Fix

1. Produce a maskable icon variant (512×512 minimum) with the crosshair
   motif redrawn or padded to fit within the centered 66% safe zone —
   background_color-filled rather than transparent, since maskable icons are
   always shown with their mask applied and a transparent backdrop can show
   through inconsistently.
2. Add both sizes as a second `icons` entry with `"purpose": "maskable"`,
   keeping the existing `"any"` entries for platforms that use them as-is.
3. Verify on at least one real Android device and one launcher before closing
   this — per this repo's evidence discipline, a manifest change that
   "should" fix the rendering is not the same as one that is shown to.
4. While in the file: confirm `orientation` and `display_override` ordering
   are intentional, and spot-check the `screenshots` sizes.

## Acceptance criteria

- [ ] A maskable icon exists and is declared in `manifest.json`
- [ ] The maskable icon's artwork is verified to sit within the safe zone
      (e.g. checked against [maskable.app](https://maskable.app) or
      equivalent) — record the check, not just the file
- [ ] Installed on a real Android device, the home-screen icon renders
      without visible cropping or an inconsistent backdrop, verified and
      noted here with the device/launcher used
- [ ] `orientation` and `display_override` are confirmed intentional or fixed
- [ ] `screenshots` entries' declared `sizes` match the actual files

## Links

- `static/manifest.json`, `static/icon-192.png`, `static/icon-512.png`
