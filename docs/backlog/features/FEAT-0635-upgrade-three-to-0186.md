---
id: FEAT-0635
title: Upgrade three to 0.186 and the matching type definitions
type: feature
status: in-progress
priority: P3
assignee: opencode
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
---

Branch: `chore/three-0186`

## Problem

`three` is available at 0.186.1 (currently 0.185.1), with `@types/three`
following at 0.186.0 (currently 0.185.4).

19 files under `src/` import `three`: the background engines in
`src/components/shared/backgrounds/engines/`, the overlays
(`FXOverlay`, `FireOverlay`, `AmbientTopline`) and the 3D background
components. Both packages live in `dependencies`.

## What was verified

- `npm run build` green on three 0.186.1 / @types/three 0.186.0.
- `npm run test:gpu` 5/5 green. This suite holds every WGSL compute shader
  against the JS path in headless Chromium.
- The 4 background-engine test files green (4 files, 98 tests):
  `galaxyFlowMapping`, `smoothing`, `volumeScale`, `indicatorSignal`.

## What was *not* verified — read this before approving

**No rendering was checked.** The GPU suite contains zero `three` imports; it
exercises the indicator compute path, not the renderer. The engine tests cover
pure math, not what reaches the screen. `npm run test:gpu` is the only browser
gate this repo has, and CI runs no Playwright at all.

So the honest claim is *built, indicator and shader parity unchanged* — not
*works*. A visual regression in the 3D background would not be caught by
anything that ran here. Someone with a browser should open the Metaverse /
3D background after this lands.

## Acceptance criteria

- [x] `three` at `^0.186.1`, `@types/three` at `^0.186.0`, both staying in
      `dependencies`
- [x] no duplicate `@types/three` entry across dependency sections
- [x] `npm run build` green
- [x] `npm run test:gpu` 5/5
- [x] background-engine tests green (98 tests)
- [ ] `npm test` green — CI
- [ ] `npm run check` green — CI (this is the real gate for the type bump)
- [ ] visual check of the 3D background — needs a browser, cannot be done here

## Notes for the reviewer

Both packages stay in `dependencies`. A previous attempt at this bump in this
same branch left `@types/three` in `dependencies` *and* added a second entry to
`devDependencies`; npm then resolved a version nobody had chosen. Types-only, so
the build output is unaffected — but the diff is now exactly two lines, and
worth keeping it that way.

## Out of scope

Remaining minor bumps (`katex`, `negotiator`, `intl-messageformat`,
`conventional-changelog-conventionalcommits`, `lightweight-charts-indicators`)
each get their own item.
