---
id: BUG-0414
title: Disabling Burning Borders flashes a white background briefly
type: bug
status: specced
priority: P0
milestone: M4
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
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
