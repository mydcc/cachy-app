---
id: FEAT-0328
title: Pixel-perfect refactor of Margin Mode and Leverage Modals
type: feature
status: in-progress
priority: P1
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: antigravity
---

# FEAT-0328 — Pixel-perfect refactor of Margin Mode and Leverage Modals

**Branch:** `ui-ux-refactor-settings` (currently active in `.worktrees/ui-ux-refactor-settings`)

## Problem

The existing Adjust Leverage and Margin Mode modals do not match the intended Cachy design guidelines as represented in the provided design mockups. Furthermore, hardcoded values and CSS styles break the Light/Dark mode theming, and layout abbreviations (like "Lev:") clutter the UI.

## Proposal

Rebuild both modals (`AdjustLeverageModal.svelte` and `MarginModeModal.svelte`) to exactly match the pixel-perfect mockups provided by the user. Ensure all design changes adhere strictly to the established Cachy rules:
1. No hardcoded colors (use CSS variables exclusively).
2. Proper structural flexbox implementations for complex graphic cards.
3. Fix localization and TS errors resulting from the changes.
4. Strictly manual testing flow: no automated tests or check scripts without explicit user permission.

## Acceptance criteria

- [x] `AdjustLeverageModal.svelte` reconstructed with a full-width green banner and custom slider with matching tick-marks (1X to 100X).
- [x] `MarginModeModal.svelte` reconstructed with complex Flexbox hierarchy for Cross/Isolated and Multi-Trade cards.
- [x] All layout components styled exclusively via `src/themes.css` variables (`var(--bg-secondary)`, `var(--accent-color)`, etc.) ensuring flawless Light and Dark mode rendering.
- [x] The label "Lev:" is removed from the inline display in `ExchangeAccountControls.svelte` and moved above as a descriptive label.
- [x] Missing translation keys (`modals.adjustLeverage...`) added to `en.json`, `de.json`, and mapped in `schema.d.ts`.
- [x] `svelte-check` passes without errors.
- [ ] UI and logic tests (`ExchangeAccountControls.component.test.ts`) are updated to reflect the new UI texts and DOM structure.

## Out of scope

- Refactoring any other modals.
- Modifying the underlying calculation logic of Leverage or Margin modes.

## State Note
Implementation of the UI is completed. The hardcoded colors that broke the Light Theme were removed and successfully replaced with Cachy CSS variables (`color-mix(in srgb, var(--accent-color) 5%, transparent)`). The visual implementation is ready for user review. 

**Next Steps for next Agent:** Wait for the user's visual sign-off. Once the UI is approved, fix the failing `ExchangeAccountControls.component.test.ts` (the test fails because it queries for "Lev:" which was removed per requirements, and the disabled-state assertions need adapting).

## Links

- `src/components/shared/AdjustLeverageModal.svelte`
- `src/components/shared/MarginModeModal.svelte`
- `src/components/inputs/ExchangeAccountControls.svelte`
