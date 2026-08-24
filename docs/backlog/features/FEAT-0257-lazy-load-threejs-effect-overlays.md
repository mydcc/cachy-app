---
id: FEAT-0257
title: Keep three.js off the startup path behind lazily loaded effect overlays
type: feature
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# FEAT-0257 — Keep three.js off the startup path behind lazily loaded effect overlays

## Problem

Every session pays for the three.js vendor bundle at startup, whether or not any
visual effect is enabled. Five modules import `three` statically:

- `src/components/shared/FireOverlay.svelte` (~L20)
- `src/components/shared/AmbientTopline.svelte` (~L20)
- `src/components/shared/FXOverlay.svelte` (~L25)
- `src/components/shared/backgrounds/engines/GalaxyEngine.ts` (~L18)
- `src/components/shared/backgrounds/engines/RaindropsEngine.ts` (~L18)

These consumers are statically imported by `src/routes/+layout.svelte`, so the
verified production build output shows the root-layout chunk statically pulling
the ~542 KB raw (`three-vendor`) chunk — est. ~130–150 KB gzipped — onto the
critical path of every session. Runtime gates exist (`FireOverlay`
enableBurningBorders, `AmbientTopline` isEnabled), but they gate *execution*,
not *loading*.

Evidence basis: static import-graph analysis + build artifacts (Architect
review, 2026-08-23). No runtime profiling; gzip figure is an estimate from raw
bytes — re-measure before quoting externally.

## Proposal

1. Wrap each overlay component in `{#if settingsState.<effectEnabled>}` inside
   `+layout.svelte`, so disabled effects never mount.
2. Convert engine-level `import * as THREE from "three"` into dynamic
   `await import("three")` inside engine init / `onMount`.
3. Pets (`src/lib/pets/*` via FXOverlay) ride the same dynamic path.

Precedent exists in-repo: the markdown vendor chunk is already dynamic-only.

## Acceptance criteria

- [ ] Production build output contains no static import edge from the root-layout
      chunk to the three.js vendor chunk (verify in build manifest).
- [ ] With burning borders / ambient topline / FX effects disabled (default),
      the three.js chunk is never fetched at startup.
- [ ] Enabling an effect at runtime lazy-loads three.js and renders correctly.
- [ ] Disabling an effect tears down its WebGL context without leaks (existing
      cleanup paths preserved).
- [ ] No COEP/CSP/header changes; iframe allowances untouched (metaverse rules,
      AGENTS.md).
- [ ] `npm run check` and affected component tests pass.

## Out of scope

- Replacing or shrinking three.js itself; changing any visual effect behavior.
- Service-worker precache strategy (separate item, FEAT-0265).
- Any financial/calculation code.

## Open questions

None — resolved during grooming (2026-08-23):

- Theme defaults: `enableBurningBorders` defaults to `false` in
  `defaultSettings` (`src/stores/settings.svelte.ts` ~L513) — effects are
  opt-in, so there is no flash-of-no-background risk on default first load.
- PR #2181 already gates FireOverlay *mounting* behind
  `{#if settingsState.enableBurningBorders}` (`src/routes/+layout.svelte`
  ~L430), but `AmbientTopline` (~L429) and `FXOverlay` (~L456) mounts remain
  ungated and all three components still statically import three — re-verified
  on develop @ f6ccde06. This item's premise stands unchanged.

## Links

- Files listed above; precedent: markdown-vendor dynamic-only chunk.
- Source: Autonomous Optimization Architect review, 2026-08-23.
