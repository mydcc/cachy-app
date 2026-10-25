---
id: FEAT-0608
title: Make SettingsGrid the only grid pattern inside the settings window
type: feature
status: done
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0605
data_class: none
adr: none
depends_on: [FEAT-0607]
assignee: opencode
branch: refactor/feat-0608-settings-grid
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

- [x] `VisualsAppearance.svelte` and `VisualsBackground.svelte` contain no
      hand-written `grid-cols-*` with a viewport breakpoint
- [x] `IndicatorSettings.svelte` uses `SettingsGrid` for its column layouts.
      The two outer `grid-cols-1` wrappers were vertical stacks (label plus
      control) and became flex columns; a 1→2 promotion would invert them.
- [x] `AutomationTab` and `CloudTab` state in a docblock why they need no grid
      (full-width fields and lists, no second column to fill)
- [x] A check fails when a file under `src/components/settings/` contains a
      viewport breakpoint (`sm:` / `md:` / `lg:` / `xl:`) inside a
      `grid-cols-*` class. The check is scoped so it cannot fire on the window
      chrome itself, which legitimately uses viewport breakpoints
- [x] The settings window is manually verified at a width below 560 px and at a
      width above 960 px; both render the intended column counts
- [x] Full-width items use `col-span-full` on the child, per the docblock rule
      (the converted grids contain no full-width child)
- [x] Any conversion that changes a control's visual size is recorded, because
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

## Progress — 2026-10-25

Converted every grid with a viewport breakpoint in the settings tree to
`SettingsGrid`. Fixed 2/3-column control groups keep their fixed grid (no
breakpoint) because they are segmented controls, not settings layouts.

- `VisualsAppearance`: four layout grids → `SettingsGrid` (3, 3, 2, 3); the
  four-way color-mode segmented control is a fixed 2×2 grid now (was 4 across
  at `sm`).
- `VisualsBackground`: eight layout grids → `SettingsGrid cols={2}`.
- `ExternalChannelCard`: the two-up field grid → `SettingsGrid cols={2}`.
- `IndicatorSettings`: the outer one-column stacks are flex columns; the inner
  controls already used `SettingsGrid`.
- `AutomationTab` / `CloudTab`: docblocks, no grid needed.
- Guard: `settingsGridAdoption.test.ts` fails on any `sm:`/`md:`/`lg:`/`xl:`
  inside a `grid-cols-*` under `src/components/settings`.

Recorded visual changes:

- Column thresholds now follow the settings content width: 560 px for two,
  960 px for three (previously `sm`/`md` viewport breakpoints).
- Converted grids use the density gap token (0.75rem in default) instead of
  `gap-4` (1rem).
- The color-mode segmented control is 2×2 at every width (previously four
  across at `sm+`).

Manual verification (Playwright, settings window): frame 500 px → content
466 px → 1 column; frame 1024 px → content 750 px → 2 columns; frame maximized
to 1400 px → content 1126 px → 3 columns.
