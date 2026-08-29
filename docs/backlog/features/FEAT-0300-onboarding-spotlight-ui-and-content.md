---
id: FEAT-0300
title: Onboarding spotlight walkthrough UI, state engine, and data-driven steps
type: feature
status: done
priority: P2
milestone: M3
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# FEAT-0300 — Onboarding spotlight walkthrough UI, state engine, and data-driven steps

> Sub-item of tracking epic [`FEAT-0299`](FEAT-0299-epic-first-time-user-onboarding.md).

## Problem

Traders wanting an interactive orientation of Cachy need a non-intrusive, 100% on-demand walkthrough that they can trigger from Settings, navigate freely (Next, Back, Skip, Restart), and that developers can effortlessly extend with new steps.

## Proposal

Build a lightweight, accessible Svelte 5 spotlight walkthrough with data-driven step configuration and on-demand Settings trigger:

1. **Trigger & Lifecycle (100% On-Demand)**:
   - Dedicated "Start Onboarding Tour" button in Settings (`SystemTab.svelte`).
   - Clicking the button closes the Settings modal and waits 2.0 seconds (`triggerStartWithDelay(2000)`) before smoothly fading in the spotlight on Step 1.
   - Never auto-pops uninvited.

2. **Full Navigation & Control**:
   - **Next:** `Next` button, `ArrowRight`, or `Enter`. Turns to `Finish` on the final step.
   - **Back:** `Back` button or `ArrowLeft` (disabled on Step 1).
   - **Skip / Dismiss:** `Skip` button, `Escape` key, or clicking the dark backdrop.
   - **Restart:** Re-triggerable anytime from Settings.

3. **Data-Driven Extensibility (`src/lib/onboarding/steps.ts`)**:
   - Array of `OnboardingStep` objects containing `id`, `targetSelectors` (candidate selectors in priority order — the first *visible* one wins, so hidden responsive variants can never produce a degenerate spotlight), `titleKey`, `descKey`, `preferredPlacement`.
   - Adding or modifying steps only requires updating this array and the i18n dictionaries.

4. **Overlay Component (`src/components/shared/OnboardingSpotlight.svelte`)**:
   - Darkened backdrop (`var(--scrim)` = `rgba(0, 0, 0, 0.7)`) with spotlight cutout (`getBoundingClientRect()`).
   - Smooth `element.scrollIntoView()` when target is off-screen.
   - Floating glassmorphism card positioned relative to the target element (top/bottom) with mobile bottom-sheet fallback (< 768px).
   - Fallback centering if no candidate element is visible.
   - Focus trap and ARIA attributes (`role="dialog"`); keyboard shortcuts never swallow Enter/Tab on focused controls.

5. **Initial 4 Guided Stations**:
   - **Station 1: Risk Management (`#trade-setup-card`)**: Position sizing based on Stop-Loss.
   - **Station 2: Take-Profit & Dynamic R:R (`#tp-targets-card`)**: Staggered TP targets & live R:R ratio.
   - **Station 3: Market Data & Exchange Sync (`#market-overview-widget`, connection indicator)**: Bitunix/Bitget connectivity; keys live in Settings.
   - **Station 4: 100% Local-First Privacy & Journal (desktop journal button, mobile toggle as fallback)**: Class A Local-First privacy & Journal.

## Acceptance criteria

- [ ] Onboarding is triggered exclusively on-demand via the button in Settings.
- [ ] Clicking the Settings button closes the Settings window and starts the tour after a 2-second delay.
- [ ] Users can navigate Next (`ArrowRight`/`Enter`), Back (`ArrowLeft`), Skip (`Escape`), and restart anytime from Settings.
- [ ] Off-screen target elements are smoothly scrolled into view before spotlight highlight.
- [ ] If a target selector is missing, card safely falls back to screen center.
- [ ] Steps are driven by `src/lib/onboarding/steps.ts`.
- [ ] All copy is fully localized in `de.json` and `en.json`.
- [ ] Mobile responsive (< 768px bottom sheet).
- [ ] `npm run check` passes.

## Out of scope

- Auto-popping walkthrough uninvited on first visit.
- Audio/sound effects.
- External libraries (pure native Svelte 5).

## Links

- [`FEAT-0299`](FEAT-0299-epic-first-time-user-onboarding.md)
- [`FEAT-0301`](FEAT-0301-ducklogic-onboarding-companion-and-achievement.md)

## State

- Shipped in [PR #2218](https://github.com/mydcc/cachy-app/pull/2218) (squash commit 2ff4dabe on develop).
