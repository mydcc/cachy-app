---
id: BUG-0047
title: The Trading Academy content is unreachable on a phone because the pattern list fills the screen
type: bug
status: done
priority: P1
milestone: M0
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0047 — The Trading Academy content is unreachable on a phone because the pattern list fills the screen

## Symptom

Opening the Trading Academy on a phone shows nothing but the pattern list (or,
on the second tab, the candlestick list). The selected pattern's chart,
description and strategy are not visible and cannot be scrolled to. The Academy
is unusable on mobile.

## Evidence

**Derived**, from three layout rules that combine. Reproduce by opening the
Academy at a viewport below 768px wide.

**1 — the container is full height.** `themes.css:3036-3045` overrides
`.modal-size-instructions` below 768px to `width: 100vw; height: 100dvh`.

**2 — the body is 80% of the viewport, and clips.** `AcademyModal.svelte:47`
passes `bodyClass="flex flex-col h-[80vh] overflow-hidden"`. The `80vh` is
hard-coded and unrelated to the `100dvh` container it sits in, and
`overflow-hidden` means anything past it is not scrollable, just gone.

**3 — the sidebar has no height limit in the mobile stacking direction.**
`ChartPatternsView.svelte:141-145`:

```html
<div class="flex flex-col md:flex-row h-full gap-4">
    <div class="w-full md:w-1/4 lg:w-1/5 flex flex-col gap-4 border-r border-[var(--border-color)] pr-4">
```

Below `md` the layout is a column and the sidebar is `w-full` with no `max-h`
and no `shrink`. The list inside it (`flex-1 overflow-y-auto`, line 171) has a
`flex-1` that means nothing, because the sidebar's own height is content-driven.
Roughly forty patterns therefore render at full height, consuming the whole
`80vh`, and rule 2 clips the main content out of existence.

`CandlestickPatternsView.svelte` has the same structure.

A fourth, smaller wrong thing on the same line: `border-r` and `pr-4` are
horizontal separators applied while the layout is vertical.

## Cause

The view was laid out for `md:flex-row` and the mobile column case was never
given a height budget. The hard-coded `h-[80vh]` then removes the scroll that
would otherwise have made it merely awkward rather than broken.

## Fix

- Replace `h-[80vh] overflow-hidden` with a height that follows the container
  (`h-full min-h-0`), so the body is as tall as the window actually is.
- Give the sidebar a mobile budget: `max-h-[35vh] shrink-0` with its own scroll,
  and let the main content take the rest. Alternatively collapse the sidebar to
  a `<select>` below `md` — the search-and-filter box is already a form control,
  so this stays consistent.
- `border-b pb-4 md:border-b-0 md:border-r md:pr-4` instead of the unconditional
  `border-r pr-4`.

Apply to both `ChartPatternsView.svelte` and `CandlestickPatternsView.svelte` —
they share the structure and must not diverge.

Do not change the desktop layout. The `md:` and `lg:` proportions are fine.

Implemented as written, with one addition the plan didn't spell out: the main
content column needed `flex-1 min-h-0` on mobile to actually claim the space
freed up by capping the sidebar — without it, the column-stacked layout had
no rule distributing the remaining height to the second child. Scoped with
`md:flex-none` so it doesn't compete with the `md:w-3/4`/`lg:w-4/5` width
split desktop already uses (an explicit `flex: 1 1 0%` flex-basis would have
overridden those widths on `≥768px`).

## Verification

No automated test — no component-rendering harness exists in this repository
(see [`BUG-0042`](BUG-0042-window-drag-jumps-on-touch.md)'s Verification
section for the same finding; building one is
[`FEAT-0050`](../features/FEAT-0050-window-manager-test-coverage.md)'s job).

Verified against the running dev server with Playwright, both tabs, both
viewport classes:

- **390×844**: the main content region (`flex-1 min-h-0` in `ChartPatternsView`)
  had a bounding box of 390×396px, non-zero and below the sidebar — the
  selected pattern's chart and description render and are visible without
  scrolling past clipped content. The sidebar list itself reported
  `scrollHeight: 1544` vs `clientHeight: 175`, i.e. genuinely scrollable
  within its own budget rather than pushing the page. Computed styles on the
  sidebar: `max-height: 295.4px` (35vh of an 844px-tall viewport, as
  intended), `border-bottom-width: 1px`, `border-right-width: 0px`. Repeated
  identically on the Candlestick tab.
- **1280×900**: sidebar `max-height: none`, `border-right-width: 1px`,
  `border-bottom-width: 0px` — the row layout and its border are what they
  were before. Screenshot comparison against the pre-fix layout shows no
  visible change: sidebar list on the left, chart and description in the
  centre, trading-strategy panel on the right.

## Acceptance criteria

- [ ] A test renders the Academy at a 390px-wide viewport and asserts the main
      content region has non-zero height; it fails without the fix — not done
      as an automated test; verified manually via Playwright per Verification
      above (bounding box 390×396px)
- [x] Both the pattern list and the selected pattern's content are reachable on
      a 390×844 viewport — verified: pattern heading, chart and description
      all rendered and visible
- [x] The sidebar scrolls independently of the main content on mobile —
      verified: `scrollHeight (1544) > clientHeight (175)` within a
      `max-height: 295.4px` box
- [x] The separator is horizontal in the column layout and vertical in the row
      layout — verified via computed `border-bottom-width`/`border-right-width`
      at both viewport widths
- [x] The desktop layout at ≥1024px is visually unchanged — verified via
      screenshot at 1280×900 and computed styles showing `max-height: none`
- [x] `CandlestickPatternsView` behaves identically to `ChartPatternsView` —
      verified on the Candlestick tab at 390×844

## Links

- [`ADR-0006`](../../adr/0006-one-window-stacking-authority.md) — why the mobile
  rule should not live in `modal-size-instructions` at all
- `src/components/shared/AcademyModal.svelte:47`
- `src/components/shared/ChartPatternsView.svelte:141-145,171`
- `src/components/shared/CandlestickPatternsView.svelte`
- `src/themes.css:3029-3060`
- Same surface, different mechanism: [`BUG-0048`](BUG-0048-glass-removes-academy-sidebar-background.md)
