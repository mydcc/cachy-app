---
id: BUG-0038
title: PWA splash screen, screenshots and long-press shortcuts regressed on Android
type: bug
status: done
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

**Resolved — see Round 6.** The actual cause was a device-side ad blocker on
the test phone blocking Chrome's own connection to Google's WebAPK
infrastructure. Nothing in this repo, this server, or this manifest was ever
the reason symptoms 1 and 3 persisted after symptom 2 (screenshots) was
fixed — five rounds of server-side investigation below are kept as the
record of what was checked and ruled out, not as remaining open work.

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
- **Round 3 (see below): removed `id`, reverted `start_url` to `/`, switched
  shortcut icons to the maskable variant.** Also unverified on-device as of
  this writing.
- **Round 6 (see below): reverted shortcut icons back to the plain,
  transparent `icon-192.png` (`purpose: "any"`)** — the Round 3 switch to
  the maskable variant is the prime suspect for shortcut menu items
  rendering with no icon at all (empty space) once shortcuts started
  working. Reasoning: matches the format every other WebAPK on the same
  device uses for its own shortcut icons (Round 2's `about://webapks`
  survey), and matches the icon-selection algorithm's normal behaviour
  (`any` is the default; `maskable` is only picked where the OS specifically
  asks for it, which a shortcut-icon slot apparently doesn't). **Not yet
  verified on-device** as of this writing — this is a plausible fix based on
  solid reasoning, not a confirmed one.

### Round 3 — firewall logs checked (inconclusive), a third ignored field, and a new experiment

The maintainer checked the actual aaPanel access logs (only a system-level
firewall is configured — no separate WAF plugin, no Cloudflare) around the
timestamps of the on-device install attempts. Findings:

- No request to `/manifest.json` or any icon file from any IP other than the
  maintainer's own (used for the `curl` tests and manual browser testing).
- One unrelated vulnerability scanner (`91.92.241.196`) probing `/.git/HEAD`
  and `/.git/config` — background internet noise, not relevant.
- Real Googlebot traffic (`66.249.x.x`, `Googlebot/2.1` user agent) crawling
  `/robots.txt` and `/` — normal SEO indexing, and notably **it reaches the
  server successfully**. That's an argument against a blanket
  "block Google Cloud IP ranges" firewall rule: if one existed and applied
  broadly, Googlebot's own crawl would be blocked too, and it isn't.
- No blocked/rejected entries at all for the relevant paths — but this is a
  plain nginx access log; if a block happens at the system-firewall/packet
  level (before nginx), it wouldn't appear here regardless. Inconclusive,
  not a clean ruling-out.

So: **no firewall involvement confirmed, but not disproven either** — the
access log simply shows zero evidence of anyone besides the maintainer ever
requesting `/manifest.json`, including no failed attempts. If Google's
WebAPK-minting service ever tried, it left no trace in this log at all.

**A third manifest-driven behavior found to be ignored by the installed
app:** the maintainer separately recalled that the installed app used to be
locked to portrait orientation, and at some point started allowing free
rotation. `orientation: "portrait"` has been in every version of the
manifest since its creation in January — unchanged, never touched by any
commit in the file's history (see the table above). If the installed app
stopped honoring a field whose declared value never changed, that's a third
independent confirmation (alongside `background_color`/`theme_color` and
`shortcuts`) that the *installed* app isn't actually running on the manifest
this repo serves — everything manifest-driven degrades together, not just
the two originally-reported symptoms.

**Also re-examined: `about://webapks`'s `Manifest Start URL` field itself
was wrong**, not just `Manifest Id`. It read `https://dev.cachy.app/` —
missing the `?pwa=true` query string our manifest's `start_url` actually
declares. Combined with the `id` fallback from Round 2, that's now two
separate fields both showing the browser-context default (bare origin)
rather than anything read from the manifest — consistent with a minting
fetch that produced nothing at all, not a partial/selective failure.

**New experiment, deployed to `dev.cachy.app`, combining three changes at
once rather than one round-trip per field** (each on-device retest costs the
maintainer real time, so this bundles well-justified changes instead of
strict one-variable-at-a-time isolation):

1. **Removed the `"id": "app.cachy"` field entirely**, reverting to the
   pre-2026-02-09 baseline where identity derives from `start_url`. This was
   added in the same suspect commit as screenshots/shortcuts/the domain
   migration and had never been tested in isolation. Directly targets the
   `Manifest Id` anomaly from Round 2.
2. **Reverted `start_url` from `/?pwa=true` back to `/`**, matching the same
   pre-2026-02-09 baseline. Confirmed safe first: `grep -rn "pwa=true"` across
   `src/` turns up nothing — the query param is not read anywhere in the app,
   so this is a pure manifest-identity change with no functional loss.
3. **Shortcut icons switched from `/icon-192.png` (transparent) to
   `/icon-192-maskable.png`** — the maintainer's own observation: shortcut
   icons had the identical transparent-to-the-edges problem the main app icon
   had before the Round 2 maskable fix, and were never updated when that fix
   landed. Same reasoning applies: Android's icon treatment for shortcuts
   plausibly needs the same safe-zone/opaque-background treatment as the main
   icon.

**Round 3 result: no change.** Deployed and tested on-device on a fresh
Chrome install. New WebAPK package name confirmed a genuine rebuild
(`org.chromium.webapk.ab40df37a541a7209_v2`, different from Round 2's), so
this was not stale data. `Manifest Start URL` and `Manifest Id` now read
correctly — but only because they coincidentally match the new defaults
(`start_url: "/"` with no `id` resolves to the same value whether the
manifest was actually read or not). **`Theme color`, `Background color`, and
`Manifest URL` are still blank.** Splash still white, shortcuts still absent.
This rules out `id`, `start_url`, and shortcut-icon transparency as the
cause — every manifest-content variable this item has now tried (screenshots,
`display_override`, maskable icons, `id`, `start_url`, shortcut icon
transparency) has been changed at least once with no effect on the blank
fields.

**Round 4 — ruling out reachability, then a full revert to the last known-
working structure.** Two things checked before reaching for content again:

- The maintainer's own aaPanel access logs showed no evidence either way (see
  Round 3) — inconclusive, not a real answer.
- **Google's own infrastructure was asked directly**, via PageSpeed
  Insights (`pagespeed.web.dev`, which runs Lighthouse server-side on
  Google's own servers, not the phone or this sandbox) against
  `dev.cachy.app`. Result: **no manifest error at all.** Google's
  infrastructure fetches and parses the manifest cleanly. This rules out
  reachability, firewall, and DNS as an explanation — Google *can* reach this
  origin without issue. The failure is isolated to the Chrome-for-Android
  WebAPK-minting backend specifically, which apparently does not share a code
  path with Lighthouse, Googlebot, or DevTools' own installability check —
  all of which read this manifest correctly.

One structural difference noticed in the earlier `curl -Iv` output, not yet
explained or tested: `cachy.app` and `dev.cachy.app` both negotiate
**HTTP/1.1 only** (`ALPN: server accepted http/1.1`), while the broken `www`
vhost (serving an unrelated site's certificate) negotiated **h2** — meaning
HTTP/2 works on this server in general, just not on Cachy's own vhosts.
Speculative, but recorded as a candidate: if WebAPK minting is less tolerant
of HTTP/1.1-only origins than Lighthouse/Googlebot are, this would explain
the failure being isolated to exactly that one code path. Untested as of
this writing — enabling HTTP/2 on both vhosts costs nothing and is good
practice regardless of whether it's related.

With content, reachability, and (mostly) infra now checked, this pass did
one more content test at the maintainer's request: **a full revert of
`static/manifest.json` to the exact structure it had on 2026-01-15** (the
last point the maintainer remembers everything working) — no `id`, no
`display_override`, `icons` reduced back to the original two `purpose: "any"`
entries only (maskable variants removed), no `shortcuts`.

**Result, confirmed on-device: identical failure.** Same blank `Manifest
URL`/`Theme color`/`Background color` in `about://webapks`, same white
splash, same missing shortcuts — on the exact byte-for-byte manifest
structure from the last point everything is remembered to have worked.

**This settles it: the manifest content is not the cause, in any
configuration this item has been able to construct.** Every variable tried
across all four rounds — screenshots, `display_override`, maskable icons,
`id`, `start_url`, shortcut icon transparency, and now a full revert to the
historically-working baseline — has produced the same result. Combined with
Round 4's reachability finding (Google's own Lighthouse infrastructure
fetches and parses this manifest without any error), the failure is
conclusively isolated to the Chrome-for-Android WebAPK-minting backend
itself, a narrow, specific Google service that evidently does not share a
code path with Lighthouse, Googlebot, DevTools, or Brave — all of which
handle this manifest correctly regardless of its exact contents.

Since content is proven irrelevant, the full-featured manifest (maskable
icons + shortcuts, both confirmed correct and beneficial for every other
client) was restored rather than left in the stripped-down diagnostic state
— there is no reason to keep the app worse for Brave/desktop/DevTools while
chasing a bug those clients don't have.

### Round 5 — HTTP/2 enabled, still no change. Investigation closed.

The HTTP/1.1-vs-h2 difference from Round 4 was tested. `dev.cachy.app`'s
nginx vhost initially used the legacy `listen 443 ssl http2;` syntax —
adding it and reloading nginx made **no measurable difference**
(`curl -Iv --http2` still negotiated `http/1.1`), because this legacy
syntax makes HTTP/2 a property of the shared IP:port *socket*, not the
individual vhost: whichever server block nginx resolves first for that
socket decides the protocol for everyone sharing it, regardless of which
vhost SNI actually selects. Other sites on the same server/IP apparently
have `http2` unset and were winning that resolution.

Switched to nginx's newer, per-vhost `http2 on;` directive (nginx ≥ 1.25.1;
`listen 443 ssl;` plus a separate `http2 on;` line, rather than the
`listen ... http2;` parameter) — this is the documented fix for exactly this
class of shared-socket problem. `nginx -t` and reload succeeded, and
`curl -Iv --http2 https://dev.cachy.app/` now confirms `ALPN: server
accepted h2` / `HTTP/2 200`. HTTP/2 is genuinely active on `dev.cachy.app`
now (not yet applied to `cachy.app`, since the test was run on beta first).

**Fresh WebAPK install against the HTTP/2-enabled origin: no change.** New
package name again (`org.chromium.webapk.a5b8f46f4fa1c706c_v2`, confirming a
genuine rebuild), `Theme color`/`Background color`/`Manifest URL` still
blank. One new data point, seen for the first time across every round:
`Last Update Completion Time` is populated and matches `Last Update Check
Time` exactly — every prior attempt (Rounds 2–4) showed the epoch
placeholder (`Thu Jan 01 1970`) there, meaning the update cycle had never
been recorded as completing. This time it completed cleanly — but the
manifest-derived fields still didn't populate, so whatever "completing"
means in Chrome's bookkeeping is independent of whether the WebAPK actually
picked up the manifest's colors and shortcuts. On-device: splash and
shortcuts unchanged from every prior round.

**HTTP/2 is now also ruled out.** Every actionable lever available to this
item — manifest content (five variations across four rounds), general
reachability (confirmed via Google's own Lighthouse infrastructure), and
transport protocol (HTTP/2, now genuinely active) — has been tested and
produced the identical result. `cachy.app` itself was not switched to the
new `http2 on;` syntax as part of this round (only `dev.cachy.app` was
tested), but there is no reason left to expect a different outcome there
given `dev.cachy.app`'s result.

**At the maintainer's request, this item's active investigation ends here.**
What remains is entirely outside this repo's reach:

- Testing from a different device or Google account, to check whether
  whatever is stuck is tied to this specific phone/account rather than the
  origin itself.
- Simply waiting — if this is a stuck reputation/cache state on Google's
  side from the many months this manifest spent genuinely broken (JPEG
  screenshots mislabelled as PNG, `display_override` listing a desktop-only
  mode first, etc.), it may resolve on its own once Google's systems next
  attempt a fresh mint.
- Filing feedback with Google/Chromium — the evidence gathered here (content
  ruled out exhaustively across five configurations, reachability confirmed
  via Google's own infrastructure, transport protocol ruled out, failure
  isolated to one specific backend) is about as strong a report as this repo
  can produce without server-side access to Google's own systems.
- The Chromium/community bug reports gathered earlier in this item (Evidence
  above) remain relevant background reading for whoever picks this up next.
- Applying the same `http2 on;` fix to `cachy.app` (production) — untested
  but harmless and good practice regardless, independent of this bug.

**Not app code. This item should not be reopened for a manifest-content fix
— there isn't one left to find.** It stays `in-progress` rather than `done`
because the reported symptoms (splash, shortcuts) are genuinely unresolved,
and rather than `dropped` because the cause is understood and worth revisiting
if new information surfaces (a Chrome update, a different device, a resolved
Google-side state) — just not something this repo can act on further today.

### Round 6 — the actual cause: a device-side ad blocker. Resolved.

The real cause, once found, made every earlier finding in this item make
sense in retrospect: **an ad blocker on the test device/network was
blocking the connection Chrome itself needs to reach Google's WebAPK
infrastructure.** Disabling it, `about://webapks` populates correctly and
the installed app shows the correct splash background and the long-press
shortcuts menu.

This reframes the entire investigation, and it is worth being explicit about
why five rounds of testing never found it: **every reachability check this
item ran was from the wrong side.** PageSpeed Insights/Lighthouse (Round 4)
and Googlebot (Round 3) both check whether *Google's servers* can reach
*this repo's* server — that path was never broken. The actual broken path
was the reverse: *the phone's own Chrome* reaching *Google's* WebAPK-minting
service, over the phone's own network/ad-blocker stack. Nothing server-side
(this repo, the aaPanel firewall, the `www.cachy.app` TLS bug, HTTP/1.1 vs.
h2) was ever going to surface a client-side network block, because none of
those checks route through the device doing the installing. The lesson for
next time a WebAPK/PWA symptom looks server-side but resists every
server-side fix: check the installing device's own network stack (ad
blockers, private DNS, VPNs, firewalls) before spending more effort on the
server.

**None of the fixes made along the way were wasted, even though none of them
were *the* fix:**

- The mislabelled JPEG screenshots (Fix, first entry) were a real, separate
  bug, independent of this one — still correctly fixed.
- The maskable icon pair fixes a real rendering problem (an unpadded,
  fully-transparent icon declared `maskable` gives the OS nothing to mask
  into) and is standard PWA best practice regardless of the ad-blocker issue.
- The `www.cachy.app` TLS misconfiguration is a real, independent bug, still
  unresolved and still worth fixing on its own merits (see Acceptance
  criteria) — just never related to this item.
- HTTP/2 is generally good practice and now correctly enabled on
  `dev.cachy.app` (not yet on `cachy.app`).
- The extensive git-history archaeology (the January `purpose` flip-flop,
  the `www` domain migration) surfaced real prior art worth knowing about
  even though neither turned out to be this bug's cause.

**One follow-up bug found once shortcuts finally rendered:** the shortcut
menu items showed with **no icon** — an empty slot where the icon belongs.
The shortcuts' `icons` entries pointed at `icon-192-maskable.png` with
`"purpose": "maskable"` (set in Round 3, itself an untested guess made while
chasing the wrong theory). Android's shortcut-icon rendering does not appear
to handle a `maskable`-only shortcut icon the way the main app icon's
adaptive-icon pipeline does — it does not degrade to *something*, it shows
nothing. Fixed by reverting the shortcut icons to the plain, transparent
`icon-192.png` with `"purpose": "any"` — the same file already used for the
regular app icon, and the format every other WebAPK on the maintainer's
device (Bitpanda Academy, Tasker Share, Vivid Money) uses for its own
shortcut icons too, per the `about://webapks` output gathered in Round 2.

The top-level `icons` array keeps its `maskable` entries — they solve a
real, confirmed problem (Brave's splash rendering, see Round 2) and are
listed *after* the `purpose: "any"` entries, so per the manifest icon
selection algorithm they are only ever used where the OS specifically
requests a maskable icon (e.g. shaping the home-screen icon) — everywhere
else, including apparently the shortcut-icon renderer, the `any` icon is
what gets used. That is already exactly the "maskable as a fallback, not the
default" relationship asked for; nothing needed to change there beyond the
shortcut icons themselves.

## Acceptance criteria

- [x] No manifest entry declares a type or size its file does not have
- [x] A test fails if that regresses
- [x] Screenshots are disabled without breaking the manifest or the test suite
- [x] `display_override`'s desktop-only entry removed — confirmed on-device
      not to be the cause, kept as a correctness fix regardless
- [x] A properly safe-zone-padded `maskable` icon pair added, addressing the
      gap an earlier pass in this item wrongly ruled out
- [x] The splash screen shows `background_color` on a real Android device —
      **confirmed working**, on both Brave (Round 2) and Chrome, once the
      device-side ad blocker (Round 6) was disabled.
- [x] Long-pressing the installed icon shows both declared shortcuts —
      **confirmed working in Chrome** after disabling the ad blocker (Round
      6). A follow-up bug surfaced at that point: shortcut icons rendered as
      empty space instead of the icon. Reverted the shortcut icons from the
      `maskable` variant (Round 3) back to the plain `purpose: "any"` icon
      as the fix — **not yet re-verified on-device** as of this writing.
- [ ] `www.cachy.app` has a working vhost (redirect + valid certificate, or
      the DNS record removed) — a real, confirmed infra bug, worth fixing on
      its own merits, but **confirmed not related** to symptoms 1/3, and
      **not part of this item's scope** — tracked here only because it
      surfaced during the investigation. Left open for a separate fix.
- [x] HTTP/2 enabled on `dev.cachy.app` — not the cause of this bug, but
      correctly configured now regardless (Round 5). `cachy.app` not yet
      switched to the newer `http2 on;` syntax — separate, low-priority
      follow-up.

**Resolved (Round 6).** The actual cause was a device-side ad blocker
blocking Chrome's own connection to Google's WebAPK infrastructure — not
this repo, not this server. See Round 6 for the full explanation, including
why five rounds of server-side reachability testing could never have found
a client-side network block. The mislabelled screenshots, the maskable icon
pair, and HTTP/2 were all real, independent fixes made along the way and are
kept; the `www.cachy.app` certificate bug remains open as a separate,
unrelated item.

## Links

- `static/manifest.json`, `static/screenshots/`, `static/icon-*-maskable.png`,
  `src/app.html`
- `src/tests/manifest_assets.test.ts` — the guard added here
