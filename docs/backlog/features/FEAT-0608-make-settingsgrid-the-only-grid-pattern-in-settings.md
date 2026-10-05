---
id: FEAT-0608
title: Make SettingsGrid the only grid pattern inside the settings window
type: feature
status: ready
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0605
data_class: none
adr: none
depends_on: [FEAT-0607]
---

# FEAT-0608 — Make `SettingsGrid` the only grid pattern in settings

`SettingsGrid.svelte` already documents the right rules for how settings lay
themselves out. Roughly twenty places in the two tabs that control appearance
ignore them.

## Problem

The settings window is resizable. Its layout must therefore follow the window's
width, not the viewport's — otherwise the same tab is two columns at one window
size and one at another, with no way for the user to predict it.

`SettingsGrid` states this in its own docblock and implements it with a
container query at a single 560 px threshold (960 px for three columns).
Adoption is 93 usages across ten components — and concentrated in exactly the
wrong place:

| Component | `SettingsGrid` usages |
| --- | --- |
| `IndicatorSettings` | 53 |
| `ChartTab` | 11 |
| `TradingTab` | 11 |
| `SystemTab` | 11 |
| `ConnectionsTab` | 7 |
| `VisualsLayout` | 5 |
| `AiTab` | 5 |
| `PaperTradingSettings` | 3 |
| `RiskLimitsSettings` | 3 |
| `HotkeySettings` | 3 |
| `AutomationTab`, `CloudTab`, `VisualsAppearance`, `VisualsBackground` | **0** |

The two tabs with zero adoption are the two a user opens to change how the app
looks, and they hold about twenty hand-written grids with viewport
breakpoints:

- `VisualsAppearance.svelte` — lines 58, 179, 260, 267, 301, 330, 378, 513, 589
- `VisualsBackground.svelte` — lines 271, 311, 349, 388, 429, 471, 477, 541, 683
- `IndicatorSettings.svelte` — lines 311, 399

Two consequences. The settings window's narrow state is untested, because the
tabs most likely to break there never see it. And a density mode changes
column gaps and padding, which would have to be applied twenty times instead of
once.

## Proposal

Convert every hand-written grid in the settings tree to `SettingsGrid`, and add
a check that keeps it that way.

The check matters more than the conversion. A docblock rule that twenty places
already broke once will be broken again.

## Acceptance criteria

- [ ] `VisualsAppearance.svelte` and `VisualsBackground.svelte` contain no
      hand-written `grid-cols-*` with a viewport breakpoint
- [ ] `IndicatorSettings.svelte` lines 311 and 399 use `SettingsGrid`
- [ ] `AutomationTab` and `CloudTab` use `SettingsGrid` or state in a docblock
      why they do not need it
- [ ] A check fails when a file under `src/components/settings/` contains a
      viewport breakpoint (`sm:` / `md:` / `lg:` / `xl:`) inside a
      `grid-cols-*` class. The check is scoped so it cannot fire on the window
      chrome itself, which legitimately uses viewport breakpoints
- [ ] The settings window is manually verified at a width below 560 px and at a
      width above 960 px; both render the intended column counts
- [ ] Full-width items use `col-span-full` on the child, per the docblock rule
- [ ] Any conversion that changes a control's visual size is recorded, because
      the density mode will later assume a uniform control height

## Out of scope

- Changing the 560 px or 960 px thresholds. If the threshold is wrong,
      FEAT-0605's N4 measurement is what shows it, and it gets its own item.
- Visual redesign of any settings row.
- The viewport-breakpoint layout of the app shell (`+page.svelte`), which is a
      different container and legitimately different.
- Density itself.

## Open questions

- FEAT-0605's N4 measures whether the settings window's `minWidth` is below
  560 px. If it is, the two-column threshold is currently unreachable and this
  item is blocked on a decision about the window's minimum width, not on the
  conversion.

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §3.2
- `src/components/settings/shared/SettingsGrid.svelte`
- [FEAT-0607](FEAT-0607-harmonize-settings-vocabulary-placement-and-tabs.md) — prereq
- [FEAT-0614](FEAT-0614-introduce-compact-default-and-wide-density-modes.md) — needs this
