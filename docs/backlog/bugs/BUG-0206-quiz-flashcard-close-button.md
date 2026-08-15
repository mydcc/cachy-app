---
id: BUG-0206
title: Quiz flashcard close button is misplaced
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

# BUG-0206 — Quiz flashcard close button is misplaced

## Symptom

In the Quiz feature, the Flashcard UI feels "somehow good, but somehow weird". Specifically, the close button is misplaced, making the UX unintuitive when the user wants to dismiss the card.

## Evidence

*Demonstrated* — Navigating to the Gamification/Quiz section and opening a Flashcard reveals that the close button is not in a standard, easily reachable, or expected position (e.g., top-right corner).

## Cause

Likely a CSS layout issue or suboptimal component structure in the Flashcard component, where absolute positioning or flexbox alignment places the button awkwardly relative to the card content.

## Fix

- Relocate the close button to a standard, expected position (e.g., top-right corner).
- Ensure the button is easily tappable on mobile devices (sufficient touch target size).
- Review the overall Flashcard layout to address the "weird" feeling.

## Acceptance criteria

- [ ] The close button on the Quiz Flashcard is intuitively placed.
- [ ] The button is easily clickable on both desktop and mobile.

## Links
