---
id: FEAT-0767
title: Reduce the market-structure tab to a lesson
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0766]
assignee: opencode
branch: feature/feat-0767-academy-structure-lesson
---

# FEAT-0767 — Reduce the market-structure tab to a lesson

## Problem

The market-structure tab is a live dashboard: five cards, five live charts and
a sticky readout strip. It duplicates the chart surface the app already has,
and it breaks in ways a lesson cannot afford. The charts refit only on a
timeframe change and while the window fills, so resizing the window leaves a
stale time and price range. The sticky strip collapses to a few pixels and the
prose scrolls over it. The Fibonacci lines hang on the bias timeframe while the
chart beneath them draws the shared timeframe, so picture and text disagree.
None of that is the real problem: the tab has no job the Technicals panel does
not do better, and a learner cannot practise on a dashboard.

## Proposal

Keep the tab as the **lesson** behind the panel block (FEAT-0766) and remove
everything live:

- Five cards, each with title, takeaway, one purpose-built SVG schematic,
  short prose and the lesson chips that open the matching indicator lesson.
- The s2 card keeps its existing schematic; the other four get one.
- One line at the top points at the Technicals panel as the place where the
  order is applied.
- The static SEO route renders the same page: no `showLiveChart` branch, no
  market subscription, no timeframe picker.

## Acceptance criteria

- [x] The tab mounts no chart and no canvas.
- [x] The tab registers no kline channel and requests no history.
- [x] No sticky readout, no timeframe picker, no bias timeframe in the view.
- [x] Five cards, each with exactly one schematic and its takeaway; the s2
      schematic is unchanged.
- [x] The lesson chips still open the matching indicator lesson.
- [x] The static and the app route render the same markup.
- [x] `MarketStructureView`'s `showLiveChart` prop is gone and every caller is
      updated.
- [x] Strings that only the live layer used are removed from `de.json` and
      `en.json`; `schema.d.ts` regenerated.
- [x] The component test asserts the absence of a chart, the schematic per
      card and the identical static route.

## Out of scope

- Click drills ("find the break") — a separate item if the lesson proves it
  needs them.
- Deleting the route or its sitemap entry.
- Moving the prose into a documentation page.

## Links

- FEAT-0766 — the daily surface this lesson explains
- `src/components/shared/MarketStructureView.svelte`
- `src/routes/[[lang]]/(seo)/academy/`
