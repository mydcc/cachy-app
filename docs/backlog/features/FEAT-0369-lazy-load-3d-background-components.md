---
id: FEAT-0369
title: Lazy-load 3D Three.js and TradeFlow background components in BackgroundRenderer
type: feature
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
size: S
---

# FEAT-0369 — Lazy-load 3D Three.js and TradeFlow background components in BackgroundRenderer

## Problem

In `src/components/shared/BackgroundRenderer.svelte:26-27`:

```typescript
import ThreeBackground from "./ThreeBackground.svelte";
import TradeFlowBackground from "./backgrounds/TradeFlowBackground.svelte";
```

`BackgroundRenderer` is imported and mounted directly in the root layout (`src/routes/+layout.svelte:36, 84`). Because `ThreeBackground` and `TradeFlowBackground` are imported statically at the top of `BackgroundRenderer`, their dependencies (including `three-vendor` at 542 kB, `galaxy.worker` at 525 kB, and `tradeFlow.worker` at 580 kB) are part of the initial module graph and asset manifests.

The majority of users run standard solid, gradient, or image backgrounds without 3D canvas rendering, yet their browser must parse references to these heavy visual chunks at startup.

## Proposal

1. Replace static component imports with dynamic imports (`{#await import(...) ...}`) or a lightweight wrapper that only instantiates `ThreeBackground` or `TradeFlowBackground` when `settingsState.backgroundType === "threejs"` or `"tradeflow"`.
2. This ensures that Three.js modules and background simulation Web Workers are fetched on demand only if the user explicitly selects a 3D animated background in settings.

## Evaluation

- **Umfang (Scope):** S (approx. 25 lines in `BackgroundRenderer.svelte`)
- **Priorität (Priority):** P2 (Initial load performance and mobile memory footprint)
- **Schwierigkeit (Difficulty):** Low
- **Dringlichkeit (Urgency):** Medium

## Acceptance criteria

- [ ] Initial bundle for non-3D users does not load `three-vendor` or 3D background workers.
- [ ] Selecting "threejs" or "tradeflow" in Settings cleanly mounts and initializes the WebGL canvas and worker without visual glitches.
- [ ] Switching back to "none", "image", or "gradient" tears down the 3D canvas and worker cleanly.

## Out of scope

- Optimizing the 3D particle shaders or Three.js scene complexity itself.

## Open questions

None.

## Links

- [`src/components/shared/BackgroundRenderer.svelte:26-27`](file:///home/pat/Dokumente/GitHub/cachy-app/src/components/shared/BackgroundRenderer.svelte#L26-L27)
- [`src/routes/+layout.svelte:36`](file:///home/pat/Dokumente/GitHub/cachy-app/src/routes/+layout.svelte#L36)
