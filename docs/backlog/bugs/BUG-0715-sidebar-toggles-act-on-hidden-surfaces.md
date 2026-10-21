---
id: BUG-0715
title: The left rail's sidebar toggles act on surfaces that may not exist or not be visible
type: bug
status: specced
priority: P2
milestone: none
created: "2026-10-21"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0715 — The left rail's sidebar toggles act on surfaces that may not exist or not be visible

## Symptom

The floating left rail shows four toggle buttons — technicals, market overview,
market activity, sentiment. Below the `xl` breakpoint, and whenever the sidebar
column is switched off, pressing one changes nothing on screen while the button
still lights up as active. For market activity there is a second disagreement:
the toggle reflects the stored preference, but the panel renders from a derived
value that also requires API keys or a paper account.

## Evidence

**Derived.** Four pieces that do not agree:

- `src/components/LeftControlPanel.svelte:174-219` — the four buttons set
  `settingsState.showTechnicals`, `showMarketOverview`, `showSidebarActivity`,
  `showMarketSentiment`, and take `class:active` from the same raw flags.
- `src/routes/+page.svelte:306` — the whole left column is inside
  `{#if settingsState.showSidebars}`; `:308` and `:747` render it as
  `hidden xl:flex`. Below 1280 px the column does not exist.
- `src/routes/+page.svelte:310` — sentiment renders only when
  `settingsState.showMarketSentiment` **and** the column exists.
- `src/stores/settings.svelte.ts:848` — `effectiveShowSidebarActivity` also
  requires exchange keys or a paper account, while the rail button shows
  `showSidebarActivity` alone.

There is no control anywhere on the rail for `showSidebars` itself, so the
surfaces these four buttons govern can be absent without any rail state saying
so.

## Cause

The rail was designed as "one toggle per sidebar panel" without a notion of the
column's own visibility. The activity toggle then acquired a second source of
truth (`effectiveShowSidebarActivity`) for a legitimate reason — no keys means no
positions — and the button was never taught about it.

## Fix

Pick one of two honest shapes and record the choice:

1. Hide the four toggles when the sidebar column is not rendered, or
2. Keep them and render the column on first use, with the rail's active state
   reading the same derived value the panel reads.

The second is the better product behaviour, but it changes layout state, so it
needs the `showSidebars` decision from BUG-0410. Either way the activity toggle
must stop showing a state the panel does not have.

## Acceptance criteria

- [ ] Below `xl`, and with `showSidebars` off, the four toggles either disappear
      or bring their surface into existence
- [ ] The activity toggle's active state matches what the panel actually renders
- [ ] A component test covers the narrow viewport and the no-keys case

## Links

- Found by [FEAT-0606](../features/FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- Evidence table: [`ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §8.1
- Related: [BUG-0410](BUG-0410-mode-state-must-not-depend-on-sidebar.md)
