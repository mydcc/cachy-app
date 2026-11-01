---
id: BUG-0768
title: Academy structure tab scrolls twice and shows empty space below the last card
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/academy-structure-scroll-space
---

# BUG-0768 — Academy structure tab scrolls twice and shows empty space below the last card

## Symptom

On the fourth Academy tab ("Marktstruktur & Regime") two scrollbars appear on
the right: one for the lesson and one for the window. Scrolling the window's
scrollbar moves past the last card into roughly 1,900px of blank space.

The other three tabs show a single scrollbar.

## Evidence

**Demonstrated** — measured in the Academy window at 1600×1000 (2026-11-01):
the view scrolled 3,052px in a 658px box, and the window body reported
`scrollHeight` 2,678 against `clientHeight` 751 — 1,927px of phantom overflow
below the last card.

## Root cause

Each card carries an `sr-only` paragraph with its diagram description. That
class positions the paragraph absolutely. The lesson's scroll container was
`position: static`, so those boxes resolved their containing block against the
window's own absolutely positioned `.content-wrapper`; they escaped the
container's clip and stretched the window's scroll area instead.

## Fix

The scroll container is now `position: relative`, so it is the containing block
for its own absolute descriptions and the window body no longer overflows.
`MarketStructureView.component.test.ts` pins the class and the `sr-only`
descriptions; the geometry was verified in a browser.

## Out of scope

- The three other Academy tabs (measured clean, they do not overflow).
- Window chrome and scrollbar styling.

## Acceptance criteria

- [x] The structure tab shows exactly one scrollbar.
- [x] Scrolling to the end stops with the last card flush against the bottom
      edge, with no blank area.
- [x] The SEO route `/academy` renders unchanged (same container shape).
