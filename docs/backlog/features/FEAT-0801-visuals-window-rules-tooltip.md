---
id: FEAT-0801
title: Move the window-rules explanation into a tooltip
type: feature
status: done
shipped: v1.6.0-beta.524 (PR #4535)
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0800]
assignee: opencode
branch: feature/feat-0801-visuals-tooltips
---

# FEAT-0801 — Move the window-rules explanation into a tooltip

## Problem

Under the tooltip threshold agreed for this series (more than ~180 characters
or more than two sentences), the Visuals tab is almost finished already:
`VisualsBackground` carries 24 `InfoTip` call sites, and every other helper
line in `VisualsTab`, `VisualsAppearance`, `VisualsLayout` and `VisualsDuck`
is a single short sentence (≤ 180 characters, ≤ 2 sentences).

One block still qualifies: `settings.windowRulesDesc` (296 characters, three
sentences) sits as a permanent paragraph under the "Window rules" heading, so
the rules editor starts with a wall of text above the controls.

## Proposal

Move `settings.windowRulesDesc` behind the existing `InfoTip` next to the
"Window rules" heading. No new key is needed: the paragraph's full text stays
the tooltip body, and the heading is the field it explains.

Everything else in the Visuals tab stays visible under the agreed threshold:

- `settings.windowRulesGeometryHint` (103 chars, 2 sentences)
- `settings.windowRulesAspectHint`, `settings.windowRulesEmpty`
- `settings.dockingPositionDesc`, `settings.densityHint`
- `settings.visuals.duck.description` and the three duck toggle descriptions

## Acceptance criteria

- [ ] `settings.windowRulesDesc` is no longer rendered as a visible paragraph;
      it is reachable through an `InfoTip` attached to the heading.
- [ ] The heading keeps an accessible name and the rules editor still starts
      with the add-rule control.
- [ ] No new locale keys, no new component.
- [ ] Targeted component tests for `VisualsLayout` pass.
- [ ] `npm run check` reports no new errors.

## Out of scope

- The short helper lines listed above — they are labels, not explanations.
- Chart, AI, Connections, System, Cloud, Super-Alert and Bots settings.

## Open questions

None.

## Links

- `src/components/settings/tabs/VisualsLayout.svelte`
- `src/components/settings/tabs/VisualsLayout.component.test.ts`
- `src/components/shared/InfoTip.svelte`
- PR: #4535 (squash-merged into `develop`)
