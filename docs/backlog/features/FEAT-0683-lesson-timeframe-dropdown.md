---
id: FEAT-0683
title: Give the lesson chart the panel's timeframe dropdown
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: [FEAT-0681]
assignee: opencode
branch: feat/lesson-timeframe-dropdown
---

# FEAT-0683 — Give the lesson chart the panel's timeframe dropdown

## Problem

The Academy lesson chart picks its timeframe with a plain `<select>`, while the
Technicals panel next to it has had a far better control for as long as anyone
remembers: a chip showing the current timeframe that opens a grid of quick picks
plus a field for any other timeframe. Two controls for one idea means two
behaviours to learn, and the lesson's is the worse one — it cannot express a
timeframe the grid happens not to list.

The lesson's version also derived its options from `settings.analysisTimeframes`
and *refused* anything outside them, so the custom entry the trader wants could
not exist without changing what "offered" means.

## Proposal

Extract the panel's chip and popup into `src/components/shared/TimeframeDropdown.svelte`
— one implementation, two call sites, rather than a second copy of the markup.
The component owns only its popup's state (open, the custom field, the hover
timer) and hands a chosen timeframe to an `onSelect` prop; the callers keep what
a pick *means*:
- the Technicals panel writes `tradeState.analysisTimeframe`, exactly as before;
- the lesson stores it in `localStorage` and redraws, exactly as before.

The quick-pick grid becomes a shared constant (`TIMEFRAME_QUICK_PICKS`, the same
six the panel has always shown) and the lesson's guard changes from "is this one
of the timeframes my setting offers" to "is this the app's notation at all", so
the custom field means something.

## Acceptance criteria

- [x] The panel and the lesson render the same timeframe control, from one component
- [x] The lesson's control offers the quick picks and a custom entry, and a pick or a submission drives the subscription and is remembered
- [x] A remembered or submitted value that is not a timeframe is refused, and the default applies
- [x] Every timeframe the analysis setting can hold is one of the quick picks, pinned by a test

## Out of scope

- **No change to what the panel's pick means.** It still writes
  `tradeState.analysisTimeframe`; the extraction moved its markup, not its
  contract.
- **No validation added to the panel's custom entry.** The panel has always
  handed its field's value straight to the analysis timeframe; making that a
  validated boundary is its own change, and this item does not silently widen or
  narrow it.
- **No change to the lesson's parameters or formulas** — FEAT-0681 left those
  reading the trader's settings, and they still do.

## State

Shipped on branch `feat/lesson-timeframe-dropdown`. `TimeframeDropdown.svelte`
holds the chip, the quick-pick grid, the custom field and the popup's own state
(open, hover timer, click-outside); `value` + `onSelect` are the whole contract.
The panel passes `TIMEFRAME_QUICK_PICKS` and keeps writing
`tradeState.analysisTimeframe`; the lesson passes the same picks and keeps
writing its `localStorage` key.

Two notes for the next reader:

- The lesson's guard is now `isDrawableTimeframe` (the app's notation) instead of
  an intersection with `settings.analysisTimeframes`. That is what makes the
  custom field work at all; the quick picks are a superset of the setting's own
  list, pinned by a test so a setting the grid cannot reach cannot creep in.
- The panel had **no test** before this change, and the extraction moved its
  chip. It has one now (`TechnicalsPanel.component.test.ts`), because otherwise
  the panel could lose its chip with every suite still green.

## Links

- `src/components/shared/TimeframeDropdown.svelte` — the extracted control
- `src/components/shared/TechnicalsPanel.svelte` — the first call site
- `src/components/shared/IndicatorLessonChart.svelte` — the second
- `src/lib/constants.ts` — `TIMEFRAME_QUICK_PICKS`, beside `ANALYSIS_TIMEFRAMES`
- FEAT-0681 — the lesson chart this control belongs to
