---
id: BUG-0324
title: Galaxy 3D disables blending instead of switching to normal blending on light themes
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0324 — Galaxy 3D disables blending instead of switching to normal blending on light themes

## Symptom

On a light theme the Galaxy 3D background's stars render as hard-edged opaque
dots rather than soft glowing points. The soft radial falloff the fragment
shader computes is thrown away.

## Cause

`src/components/shared/ThreeBackground.svelte` picks the blending mode for the
galaxy material by numeric value:

```js
blending: light ? 0 : 2, // NormalBlending=0, AdditiveBlending=2 (approx)
```

The comment is wrong, and so is the value. In three.js the constants are
`NoBlending = 0`, `NormalBlending = 1`, `AdditiveBlending = 2`. The light-theme
branch therefore selects `NoBlending`, which makes the GPU ignore the fragment
shader's alpha entirely. The intent — visible in the accompanying `cutoff: 0.6`,
which only makes sense if alpha is still respected — was clearly `NormalBlending`.

`GalaxyEngine.updateColors()` passes the number straight through to
`material.blending`, so nothing downstream corrects it.

## Expected

Light themes render the galaxy with `NormalBlending`, keeping the soft point
falloff while avoiding the wash-out that additive blending causes on a bright
background.

## Fix

Change the literal to `light ? 1 : 2`, or better, import `THREE.NormalBlending`
/ `THREE.AdditiveBlending` by name so the next reader cannot repeat the mistake.
Note the worker boundary: the value is sent through `postMessage`, so it must
stay a plain number on the wire — resolve the constant on the component side.

## Notes

Found while building FEAT-0323 (the Trade Flow galaxy mode), which resolves the
same palette from the same theme variables. That mode already uses the correct
`light ? 1 : 2`, so the two galaxies currently disagree on light themes. Fixing
this makes them match again.

## Links

- `src/components/shared/ThreeBackground.svelte`
- `src/components/shared/backgrounds/engines/GalaxyEngine.ts`
- `src/components/shared/backgrounds/TradeFlowBackground.svelte` (`resolveGalaxyPalette`)
- [FEAT-0323](../features/FEAT-0323-galaxy-tradeflow-mode.md)
