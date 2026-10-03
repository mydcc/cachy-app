---
id: FEAT-0604
title: Audit the UI status quo: windows, elements, control sizes, CSS debt
type: feature
status: ready
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# FEAT-0604 — Audit the UI status quo

The density work this unlocks cannot be planned against a guess. Cachy has
accumulated its UI incrementally, and the parts that disagree with each other
are spread over 167 files. A measurement first, then the fixes in dependency
order.

This is the parent of the UI density and window-handling items. It exists so
that each later item can link to evidence instead of re-deriving it.

## Problem

Nobody can currently answer, from the repository, these questions:

- Which windows exist, which flags govern them, and which of those flags
  contradict each other?
- How many places decide the height of a control, and are they consistent?
- How many distinct heights does a `<button>` have?
- What named categories of CSS debt exist, and how large is each?

The proposed change — make inputs 32 px instead of 42 px, and add a
compact/default/wide setting — is a global change to a system whose global
rules do not exist yet.

## Proposal

Produce and maintain one status-quo document that names the findings, with
counts and file references, and verify the three claims that reading the source
cannot settle.

A draft already exists at
[`assets/FEAT-0604/ui-zustandsaufnahme.md`](../assets/FEAT-0604/ui-zustandsaufnahme.md).
It covers the shell zones, the window system, settings, control sizes, buttons,
ten named CSS debt categories and ten findings beyond the original brief. Three
of its claims are still unverified and are the actual work left here.

## Acceptance criteria

- [ ] `docs/backlog/assets/FEAT-0604/ui-zustandsaufnahme.md` exists and names
      every finding with a file reference or a count
- [ ] N4 resolved by measurement: the settings window's `minWidth` is compared
      against `SettingsGrid`'s 560 px container threshold, and the answer
      recorded. If `minWidth < 560`, that is filed as its own item
- [ ] N8 resolved by measurement: `SettingsContent`'s tablist is checked for
      `role="tab"`, `aria-selected`, roving tabindex and arrow-key navigation;
      `VisualsTab`'s pills are checked for roles. Recorded either way
- [ ] N9 resolved by reading [FEAT-0328](FEAT-0328-compact-account-controls-and-fee-display.md)
      and [BUG-0411](../bugs/BUG-0411-modal-windows-oversized-polish.md) for
      what they deliberately did not change
- [ ] Every count in the document can be reproduced with the grep it names
- [ ] Each finding that later becomes work has a child item linked from it

## Out of scope

- Fixing anything. This item produces evidence, not behaviour changes.
- A visual design pass or new mockups.
- Auditing the SEO pages under `src/routes/[[lang]]/(seo)/` beyond noting that
  they share the same stylesheets.
- Window sizing conclusions, which BUG-0411 already settled.

## Open questions

- Should the document live in `docs/backlog/assets/` (per-item, dies with the
  audit) or in `docs/ui/` (permanent, referenced by other docs)? The current
  location follows the backlog README; a permanent home may be better once the
  density items are done and the document becomes a reference rather than a
  baseline.

## Links

- Draft: [`assets/FEAT-0604/ui-zustandsaufnahme.md`](../assets/FEAT-0604/ui-zustandsaufnahme.md)
- [`../README.md`](../README.md)
- [FEAT-0605](FEAT-0605-button-placement-visibility-and-dependency-audit.md) — first child
- [FEAT-0606](FEAT-0606-harmonize-settings-hierarchy-and-tab-naming.md) — settings track
- [FEAT-0608](FEAT-0608-introduce-control-and-density-tokens.md) — the enabler
- [FEAT-0613](FEAT-0613-introduce-compact-default-and-wide-density-modes.md) — the goal
