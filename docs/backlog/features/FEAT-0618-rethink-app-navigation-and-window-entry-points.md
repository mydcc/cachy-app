---
id: FEAT-0618
title: Rethink app navigation and window entry points
type: feature
status: idea
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

# FEAT-0618 — Rethink app navigation and window entry points

There is no app navigation. What exists is four unrelated sets of buttons that
happen to move the user between things.

## Problem

| Surface | File | What it actually is |
| --- | --- | --- |
| Floating left rail | `src/components/shared/LeftControlPanel.svelte` (249 lines) | the app's only persistent chrome |
| Main header cluster | `src/routes/+page.svelte` | presets + theme + reset + journal, in one flex row |
| Journal tab strip | `DashboardNav.svelte` (81 lines) | journal-local deep-dive presets |
| Settings rail | `SettingsContent.svelte` | 8 settings tabs |

`src/components/layout/` contains exactly one file, `Header.svelte` (98 lines).

The consequence is that a user who wants to open the chart window, the academy
window, the channel, or the assistant has to learn four different places to
look. And the header cluster mixes four unrelated concerns — presets (data),
theme (preference), reset (destructive), journal (navigation) — in one row with
no grouping, so the navigation target is indistinguishable from the data
control next to it.

This is the item that would give the app a real shell. It is `idea` rather than
`specced` because the design question has not been answered, and the answer
changes what gets built.

## Proposal

Answer one question first: **what are Cachy's top-level destinations?** Today
they are implied by whichever window types exist — calculator, journal, chart,
market dashboard, academy, assistant, channel, chat, alerts, settings. Some are
windows, some are a toggle on the main page, some are settings tabs. That
inconsistency is the actual problem, and it is not a CSS problem.

Only after that answer exists does this become a spec about entry points,
grouping, and keyboard access.

## Acceptance criteria

- [ ] A written list of Cachy's top-level destinations, each with what opens it
      today and how a user is expected to discover it
- [ ] A decision on whether the app gets a persistent navigation surface, and
      where it sits relative to `LeftControlPanel` and the settings rail
- [ ] A decision on how the four existing surfaces relate — merged, nested, or
      left alone with documented ownership
- [ ] The result is expressed as acceptance criteria on *this* item and the
      status moves to `specced`
- [ ] Everything reachable by pointer is reachable by keyboard, and every
      destination has a documented keyboard route

## Out of scope

- Implementing a navigation component. This item produces the decision; the
      implementation is a new item.
- Window snapping or tiling, which is
      [FEAT-0616](FEAT-0616-add-magnetic-snapping-and-edge-tiling-for-windows.md).
- Sidebar resizing, which is
      [FEAT-0617](FEAT-0617-turn-sidebar-width-into-a-token-and-allow-resizing.md).
- Adding or removing features. This is about how existing ones are reached.
- The SEO pages, which have their own navigation.

## Open questions

- Is a persistent navigation rail the right answer for a calculator-first
  trading app, or does it compete with the space the calculator needs? This is
  a product question and it is why the item is not specced.
- Should windows become the destinations (open a window per section) or should
  the sections become routes? Windows are the current model and the SEO pages
  are the current counter-example; both exist.
- Is `LeftControlPanel` a navigation rail or a settings tray? At 249 lines with
  its own purpose it is unclear, and that ambiguity is what this item has to
  resolve before anything else can.
- Does this need an ADR? "How the user moves around the app" constrains future
  UI work as much as the Local-First boundary does.

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §1 and §5.1
- `src/components/shared/LeftControlPanel.svelte`
- `src/routes/+layout.svelte`
- [FEAT-0606](FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- [FEAT-0616](FEAT-0616-add-magnetic-snapping-and-edge-tiling-for-windows.md)
- [FEAT-0617](FEAT-0617-turn-sidebar-width-into-a-token-and-allow-resizing.md)
