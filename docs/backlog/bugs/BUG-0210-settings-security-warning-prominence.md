---
id: BUG-0210
title: Security Warning in settings is too prominent and misplaced
type: bug
status: specced
priority: P3
milestone: none
editions: [community]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0210 — Security Warning in settings is too prominent and misplaced

## Symptom

The new Security Warning displayed in the Settings modal is visually too dominant and incorrectly placed, drawing unnecessary attention and disrupting the layout.

## Evidence

*Demonstrated* — Opening the Settings modal shows the warning taking up too much space or prominence compared to the actual settings controls.

## Cause

The warning was likely added as a large block-level alert component near the top or middle of the settings flow, rather than being treated as subtle foundational information.

## Fix

- Reduce the visual footprint of the Security Warning.
- Relocate it to the footer of the Settings modal.
- Use a small, single-line text layout in the danger/warning color variable instead of a large alert box.

## Acceptance criteria

- [ ] The security warning in the Settings is moved to the footer.
- [ ] The warning is styled as a small, single-line text in a danger/warning color.

## Links
