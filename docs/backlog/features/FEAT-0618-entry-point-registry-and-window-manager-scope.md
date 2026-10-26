---
id: FEAT-0618
title: Define the entry-point registry and align the window manager scope with a reference
type: feature
status: done
assignee: opencode
branch: docs/feat-0618-entry-point-registry
priority: P3
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0605
data_class: none
adr: none
depends_on: [FEAT-0616, FEAT-0617]
---

# FEAT-0618 — Define the entry-point registry and align the window manager scope with a reference

Cachy is a workspace, not a website: there is no classic site menu, and the
four existing surfaces stay four surfaces. What is missing is the neutral
architecture behind them, plus a comparison of the window manager's scope
against a reference window manager.

## Problem

| Surface | File | What it actually is |
| --- | --- | --- |
| Floating left rail | `src/components/shared/LeftControlPanel.svelte` (249 lines) | the app's only persistent chrome |
| Main header cluster | `src/routes/+page.svelte` | presets + theme + reset + journal, in one flex row |
| Journal tab strip | `DashboardNav.svelte` (81 lines) | journal-local deep-dive presets |
| Settings rail | `SettingsContent.svelte` | 8 settings tabs |

Each surface carries its own hardcoded knowledge of what it can open: its own
list, its own labels, its own opening logic. Adding a destination means editing
up to four places, and none of them agrees with the others about labels, icons,
or keyboard access.

Separately, the window manager's feature scope was never compared against a
reference window manager. [FEAT-0616](FEAT-0616-add-magnetic-snapping-and-edge-tiling-for-windows.md)
adds snapping without knowing what else a good window manager does, so its
scope is a guess.

Two decisions are already made and are not revisited here: there is no
persistent website-style navigation menu, and windows remain the destination
model — no migration of sections to routes.

## Proposal

Two parts, in order.

**1. Reference research.** The executing agent asks the user in the session for
the URL of the reference window manager, then researches its properties and
feature scope there: focus policies, stacking, tiling, window rules, virtual
desktops, scripting, and whatever else the reference documents. The item text
deliberately names no product and no URL — the reference is the user's choice
at execution time, and the executing agent records which reference was named
alongside the comparison table. The result is a table, reference versus Cachy's
window manager, one row per feature. What a browser cannot do (compositing and
the like) is sorted out explicitly instead of silently ignored. Describe
behaviour; do not copy foreign code into this repository.

**2. Entry-point registry spec.** One entry per destination: ID, i18n labels,
icon, opener type (`window` | `toggle` | `tab` | `route`), keyboard shortcut,
and visibility condition. Data and contract, no UI. The four surfaces become
views over the registry instead of maintaining their own lists.

This item produces research and a spec. Implementing the registry is a
follow-up item.

## Acceptance criteria

- [x] A comparison table exists: reference window manager versus Cachy's
      window manager, one row per feature, with a verdict per row (adopt /
      defer / browser-impossible)
- [x] Every verdict of "defer" names the condition under which it is revisited
- [x] The table records which reference the user named in the session; the item
      text itself names no product and no URL
- [x] The registry contract is specified: entry fields, opener types, and who
      may add or group entries
- [x] The four surfaces are mapped to the registry: which entries each surface
      shows, and by which rule
- [x] Every registry entry has a keyboard route; pointer-only access is called
      out where it remains
- [x] The visibility condition per entry reuses the enabling-state vocabulary
      from [FEAT-0606](FEAT-0606-button-placement-visibility-and-dependency-audit.md)'s
      audit table

## Out of scope

- Merging the four surfaces into one navigation, or implementing a navigation
  component.
- Implementing the registry. This item produces research and a spec; the
  implementation is a new item.
- Migrating sections to routes. Windows remain the destination model.
- Adding or removing features. This is about how existing ones are reached.
- Copying foreign code into this repository.
- The SEO pages, which have their own navigation.

## Open questions

- Should the reference research (comparison table) and the registry spec be
  split into two items? They are two reviewable units; keeping them together
  risks an unbounded item.
- Does the registry contract need an ADR? "How the user reaches a destination"
  constrains future UI work the way entry points do.

## Progress

Research and spec are in [`assets/FEAT-0618/`](../assets/FEAT-0618/). The
comparison asset records the reference the user named in the session; this item
text deliberately does not repeat it.

- [`window-manager-comparison.md`](../assets/FEAT-0618/window-manager-comparison.md):
  24 feature rows, each with `adopt`, `defer` (plus reopen condition) or
  `browser-impossible`, and the source pages used.
- [`entry-point-registry.md`](../assets/FEAT-0618/entry-point-registry.md):
  entry/placement/opener/condition/keyboard contract, 10 global destinations,
  5 journal tabs, 8 settings tabs, the four surface rules, ownership, CI
  validation and migration order.

The comparison’s main finding is that the largest real gap is **keyboard window
traversal** (a switcher), not more tiling. OS/compositor features are marked
browser-impossible rather than deferred; rules, grouping, shading and scripting
have explicit reopen conditions. The registry contract deliberately leaves the
four surfaces separate and treats header presets/theme/reset as actions, not
destinations.

Follow-up: an implementation item (registry data + migration in five steps;
see the spec’s migration order) should be opened after this spec is accepted.
No UI was migrated here.

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §1 and §5.1
- Research: [`assets/FEAT-0618/window-manager-comparison.md`](../assets/FEAT-0618/window-manager-comparison.md)
- Spec: [`assets/FEAT-0618/entry-point-registry.md`](../assets/FEAT-0618/entry-point-registry.md)
- `src/components/shared/LeftControlPanel.svelte`
- `src/routes/+layout.svelte`
- [FEAT-0606](FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- [FEAT-0616](FEAT-0616-add-magnetic-snapping-and-edge-tiling-for-windows.md)
- [FEAT-0617](FEAT-0617-turn-sidebar-width-into-a-token-and-allow-resizing.md)
