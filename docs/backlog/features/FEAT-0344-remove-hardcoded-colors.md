---
id: FEAT-0344
title: "Replace hardcoded hex colors with CSS design tokens"
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
parent: FEAT-0341
---

## Problem
`AGENTS.md` states: "Theming: No hardcoded colors (`#ffffff`, etc.). Use CSS variables".
Currently, 18 components contain hardcoded hex color values, bypassing the application's theming system. These include major chart components (`ScatterChart.svelte`, `CandlestickChart.svelte`, `RadarChart.svelte`) and overlays.

## Fix
Audit the identified components and replace hardcoded hex colors with the appropriate CSS variables from `src/themes.css`.

## Acceptance criteria
- [ ] No `.svelte` file contains hardcoded hex colors (e.g., `#[0-9a-fA-F]{3,8}`).
- [ ] All replaced colors correctly adapt to Light and Dark modes.
- [ ] `npm run check` passes.
- [ ] Manual verification shows charts and overlays rendering correctly in all themes.

## Out of scope
- Defining new design tokens (unless absolutely necessary to replace a specific unique hardcoded color).
- Adjusting structural CSS properties (margins, padding, etc.).
