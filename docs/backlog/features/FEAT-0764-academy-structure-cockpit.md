---
id: FEAT-0764
title: Turn the market-structure tab into a two-column cockpit
type: feature
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0686]
---

# FEAT-0764 — Turn the market-structure tab into a two-column cockpit

## Problem

Five stacked cards with prose, readings and a chart each read as one long
column: the learner scrolls past text to reach the chart that belongs to it,
and loses the live reading as soon as the first card is scrolled away
(screenshots, 2026-10-31).

## Proposal

Each card becomes a two-column layout above the `@3xl` container step — prose
(number, takeaway, reading, body, schematic, lesson chips) left, chart right —
and stays the existing single flow below it, so phones keep stacking. A sticky
readout strip above the cards repeats the live reading (bias, last break,
nearest R/S, ADX/Choppiness, BB bandwidth/ATR) as one scrollable line; it is
hidden on the static SEO route, where there is no live chart. The reading
values move into shared `$derived`s, so the strip and the cards cannot
disagree.

## Acceptance criteria

- [x] Above `@3xl` every card is a prose|chart grid; below it the card is the
      old stacked flow.
- [x] The s2 schematic lives in the prose column; charts (and the s1 chart
      hint) live in the chart column.
- [x] A sticky readout strip shows bias, last break, R/S, ADX/Choppiness and
      BB/ATR from the same deriveds the cards read.
- [x] `showLiveChart=false` renders no readout and no chart column, and no card
      carries the grid classes.
- [x] Only container-query variants (`@…`) are used, never viewport
      breakpoints.
- [x] New string `academy.structure.read.summaryLabel` exists in DE and EN;
      `schema.d.ts` regenerated.

## Out of scope

- Collapsible cards or a chapter rail (the alternative layouts discussed).
- Per-card timeframes.
- Content wording changes.

## Links

- FEAT-0686 — the live readings this reorganises
- FEAT-0763 — the deeper chart window the cards now show
- `src/components/shared/MarketStructureView.svelte`
- BUG-0762 — the single-line contract reused for the readout strip
