---
id: FEAT-0022
title: Make settings findable with a search box
type: feature
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# FEAT-0022 — Make settings findable with a search box

## Problem

The settings window has grown to nine tabs plus nested indicator configuration.
Finding a specific setting means remembering which tab it is on.

## Proposal

A search field in the settings sidebar that filters across all tabs, with
reusable `SettingsGroup` / `SettingsRow` components so rows are consistent
enough to be searchable.

Carried from `docs/archive/plans/settings-ui-optimization-20260228.md`, which
was never executed — `src/components/settings/ui/` does not exist. The plan is
still reasonable; it is preserved here rather than in the archive so it does not
get lost.

## Acceptance criteria

- [ ] Typing filters settings across every tab
- [ ] Selecting a result navigates to it and highlights it
- [ ] Every setting is reachable by searching its visible label in both
      languages
- [ ] No behaviour change to any setting itself

## Links

- `docs/archive/plans/settings-ui-optimization-20260228.md`
- `src/components/settings/`
