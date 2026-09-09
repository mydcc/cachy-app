---
id: BUG-0414
title: Disabling Burning Borders flashes a white background briefly
type: bug
status: in-progress
priority: P0
milestone: M4
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/bug-0414-white-flash
---

# BUG-0414 — Disabling Burning Borders flashes a white background briefly

## Symptom

Reporter (Sep 2026): switching Burning Borders off in Settings flashes
a white background for a split second. Minor visual defect, reported
for the record — explicitly not urgent, separate topic.

## Reproduction

1. Settings → Visuals → Burning Borders on.
2. Switch Burning Borders off.
3. A white background flashes briefly where the themed dark background
   should be.

## Cause

Not yet identified — examine only, per reporter request. Pointers:
fire overlay mount in `src/routes/+layout.svelte:116,550`
(`FireOverlayComponent`, gated on `settingsState.enableBurningBorders`),
the `burn` action (`src/actions/burn.ts:182,278`), setting plumbing
(`src/stores/settings.svelte.ts:438-443,711-715,1184-1195,2032-2042`).
Suspected shape: overlay/canvas teardown revealing an unpainted (white)
base layer for one frame — check base background paint order and
whether teardown should hide before detach.

## Expected

- No white flash when toggling Burning Borders off (or on), on desktop
  and mobile widths, both themes.
- Out of scope: any change to the effect itself, its intensity setting,
  or other visuals.

## Notes

Filed as minor per reporter; priority P0 per project rule for new bugs.
Documented only — no investigation done yet by design.

## Triage (2026-09-09, opencode — examine-only, no code changed)

- Scope correction from reporter: the flash covers only the background
  layer, not the whole page.
- The mechanism sketched in the issue body (`--page-bg-base`, warm-up
  transition) does not exist in the tree: zero hits repo-wide, and
  `git log --all -S "page-bg-base"` is empty — the variable never
  existed. Pointer line numbers in the issue are stale (e.g.
  `OnboardingSpotlight.svelte:15` is the license header).
- Verified toggle path: plain `bind:checked`
  (`VisualsAppearance.svelte:219`) → `fireStore` cleanup
  (`src/actions/burn.ts:182`) → unmount of three transparent
  `FireOverlay` canvases (`src/routes/+layout.svelte:588`). No
  background component (`BackgroundRenderer`, `BackgroundAnimations`,
  `ThreeBackground`, `TradeFlowBackground`, `AmbientTopline`) reads
  `enableBurningBorders` or `borderEffect`. `body` is transparent,
  `html` carries the theme base color; `applyThemeToDom` runs on theme
  switch only. No reload on toggle.
- Blocked on repro facts: theme, `backgroundType`, toggle location /
  browser (or a video of the flash). A 1–2 frame transient cannot be
  found by reading code, so no honest fix plan is possible yet.
- Skipped per reporter instruction 2026-09-09; stays `specced` until
  the repro facts land.
- Repro confirmed 2026-09-09 by reporter test: Settings toggle off, Dark
  theme, Default background, Brave — page background flickers white
  briefly, intermittently. Unblocked; fix in progress on
  `fix/bug-0414-white-flash`.
- Negative result 2026-09-09: deferring the GL teardown by one frame
  (rAF) did not stop the flicker — reporter-tested, still flashes.
- Precedent found: `0f2ff27` (Feb 2026) removed `forceContextLoss()` from
  `ThreeBackground` and `TradeFlowBackground` as "risky". Same overlay
  class, same risk. New direction: remove the call in `FireOverlay`
  instead of deferring it (`dispose()` stays). Reporter also observes the
  same pattern in the Sentiment Topline region; `AmbientTopline.svelte`
  still calls `forceContextLoss()` — separate scope decision, untouched
  here.
