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

### Round 2 — after the maskable icons shipped, and the real root cause

The maskable icons (see Fix) were deployed and tested on-device. Results,
gathered across both Brave and Chrome on the same Android device:

- **Splash is fixed in Brave** — dark background, icon, and title footer, all
  correct, on a fresh install. The maskable-icon fix works.
- **Shortcuts still absent in Brave** — but this is not evidence against the
  fix: Brave has an **open, known upstream bug**,
  [brave/brave-browser#56133](https://github.com/brave/brave-browser/issues/56133),
  where installed PWAs on Android become plain Home Screen Shortcuts, never a
  true standalone app with its own package. Native app shortcuts require a
  real installed package; a browser-side shortcut can't have them, by
  construction. Confirmed further via `brave://webapks/`, which shows Cachy's
  entry stuck at the epoch (`Thu Jan 01 1970`) for both "Last Update Check
  Time" and "Last Update Completion Time" — Brave has never actually
  completed a real update cycle for it. Brave is not a valid test bed for
  symptom 3 and should be excluded from further testing here.
- **Chrome: still broken, but diagnosably so.** `about://webapks` (Chrome's
  own internal WebAPK registry) initially didn't list Cachy **at all** —
  meaning Chrome's "Install app" had, this whole time, silently produced a
  plain bookmark shortcut, never a real WebAPK, which alone fully explains
  every symptom (a bookmark has no manifest-driven splash and no native
  shortcuts). After another explicit "Install app" + forced update via the
  `about://webapks` "Update" button, a real WebAPK entry *did* appear for
  Cachy (`org.chromium.webapk.a4f525ce7006f1ec6_v2`, targeting
  `dev.cachy.app`) — but with **`Manifest URL`, `Theme color`, and
  `Background color` all blank**, unlike the three other WebAPKs installed on
  the same device (Bitpanda Academy, Tasker Share, Vivid Money), which all
  have these fields populated. More tellingly: **`Manifest Id` reads
  `https://dev.cachy.app/`**, not the `https://dev.cachy.app/app.cachy` that
  our declared `"id": "app.cachy"` should resolve to per spec. A blank/
  fallback `id` is exactly what happens when the manifest fetch used for
  minting never actually succeeded — Chrome falls back to deriving identity
  from `start_url` alone. Shortcuts remained absent even against this
  "real" WebAPK.

**A real bug found while chasing the maintainer's memory of when this last
worked — but ruled out as the explanation, not confirmed as one.** The
maintainer recalled shortcuts working before screenshots were added. Commit
`7f40111` (2026-02-09, the same commit that first added `screenshots` *and*
`shortcuts`) also silently migrated the canonical domain from
`www.cachy.app` to bare `cachy.app`. Screenshots were already ruled out
independently (removing the key didn't fix anything), which pointed at the
domain migration as worth checking. `curl -Iv` from the maintainer's own
machine (this sandbox cannot reach the domain) found something real:

```
$ curl -Iv https://www.cachy.app/manifest.json
* Server certificate: subject: CN=board.heinze-media.com
* SSL: no alternative certificate subject name matches target hostname 'www.cachy.app'
curl: (60) SSL: no alternative certificate subject name matches target hostname 'www.cachy.app'

$ curl -Iv https://cachy.app/manifest.json      →  200 OK
$ curl -Iv https://dev.cachy.app/manifest.json  →  200 OK
```

**`www.cachy.app` serves the TLS certificate for an unrelated domain**
(`board.heinze-media.com`, apparently another site on the same server/IP,
`162.55.39.50`) — every TLS handshake to `www.cachy.app` fails at the
certificate stage. This is a genuine, independent infrastructure bug (no
dedicated nginx vhost for `www.cachy.app`, so an unmatched SNI falls through
to whatever server block is first/default on that IP) and worth fixing on
its own merits.

**But it does not explain this item's symptoms, and it was a mistake for an
earlier draft of this section to lean on it as though it did.** `dev.cachy.app`
shows the identical broken WebAPK behavior (blank manifest URL, blank colors,
no shortcuts) and has **no relationship to `www.cachy.app` at all** — there
has never been a `www.dev.cachy.app`, and the February migration only ever
touched `www` vs. bare `cachy.app`. A broken certificate on one hostname
cannot be why a completely unrelated hostname degrades the same way. Caught
by the maintainer immediately on review, before this went further — recorded
here rather than quietly corrected, per this repo's evidence rule.

**What's left, now that `www` is set aside:** something affecting *both*
`cachy.app` and `dev.cachy.app` uniformly, at the server/infrastructure level
rather than per-vhost, most likely something that treats Google's WebAPK-
minting request (a server-to-server fetch from Google's infrastructure, not
the phone's own browser) differently from a normal browser request — a WAF,
bot-protection rule, or firewall on the aaPanel server that the maintainer
confirmed exists but hasn't yet inspected for this. **Untested**: checking
the aaPanel firewall/WAF logs (commonly the "网站防火墙"/Nginx-firewall or
CC-protection module) for blocked requests to `/manifest.json` around
install-attempt timestamps, especially from non-phone-browser user agents or
Google Cloud IP ranges.

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

- **Check the aaPanel firewall/WAF for blocked requests to `cachy.app` and
  `dev.cachy.app`** (not just `www`) around install-attempt timestamps —
  current best lead, since it's the one thing that could uniformly affect
  both domains the way the symptom does. Look for non-phone-browser traffic
  or Google Cloud IP ranges getting 403/blocked on `/manifest.json` or the
  icon files.
- **Fix the `www.cachy.app` vhost anyway** — real, confirmed bug (TLS cert
  for `board.heinze-media.com` served on `www.cachy.app`), worth doing
  regardless of whether it turns out related to symptoms 1/3. Either a 301 to
  `https://cachy.app` with a certificate that actually covers `www` as a SAN,
  or drop the DNS record if `www` was never meant to resolve.
- If neither turns up anything: the remaining candidates are (a) something
  genuinely platform-side (see the Chromium/community bug reports gathered
  during this pass — Chrome on Android has open, unresolved reports of
  installed PWAs ignoring `background_color`/`theme_color` independent of
  manifest correctness), or (b) something this item hasn't found yet. Four
  independent failed fix attempts across seven months (two in January, the
  `site.webmanifest` rename, and `display_override` this round) makes (a)
  worth taking seriously if the infra checks above turn up nothing.
- Brave is confirmed out of scope for symptom 3 specifically (upstream bug,
  see Round 2) — don't re-test shortcuts there, only splash/icon.
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
- [x] The splash screen shows `background_color` on a real Android device —
      **confirmed in Brave** on a fresh install (Motorola Edge 30, Brave for
      Android). Chrome on the same device still shows white; cause not yet
      identified (see "What's left" above — likely infra-level, affects both
      `cachy.app` and `dev.cachy.app`, so `www` alone doesn't explain it)
- [ ] Long-pressing the installed icon shows both declared shortcuts —
      not yet achieved in any tested browser. Brave is structurally incapable
      of this (upstream bug, out of scope here); Chrome remains the only
      valid target and its blocker is still unidentified
- [ ] `www.cachy.app` has a working vhost (redirect + valid certificate, or
      the DNS record removed) — a real, confirmed infra bug worth fixing on
      its own merits, but **not confirmed to be related to symptoms 1/3**
      (see "What's left" above — it can't explain `dev.cachy.app` showing the
      same symptom, since that hostname has no relationship to `www`)

## Links

- `static/manifest.json`, `static/screenshots/`, `static/icon-*-maskable.png`,
  `src/app.html`
- `src/tests/manifest_assets.test.ts` — the guard added here
