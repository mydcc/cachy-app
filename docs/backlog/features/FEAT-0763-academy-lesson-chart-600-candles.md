---
id: FEAT-0763
title: Draw 600 candles in the Academy lesson charts
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0686]
assignee: opencode
branch: feature/feat-0763-lesson-chart-600-candles
---

# FEAT-0763 — Draw 600 candles in the Academy lesson charts

## Problem

The lesson charts and the structure cockpit sliced the last 300 candles and
asked the history pager for the user's chart depth. A structure reading
("4h is bearish") needs weeks behind it, and the visible window opened on the
library default of a few hundred bars at the right edge — a learner saw far
fewer candles than the lesson talks about (screenshots, 2026-10-31).

## Proposal

One shared window for every Academy chart: `LESSON_CANDLE_WINDOW = 600` in
`src/lib/academy/lessonSettings.ts` (~25 days at 1h), with `lessonKlines()`
owning the defensive filter both callers duplicated. Both ask
`marketWatcher.ensureHistory(symbol, tf, LESSON_HISTORY_TARGET)` before
registering (the per-symbol:timeframe lock makes the register path's
chart-depth call a no-op), and the time scale fits the drawn window once per
symbol/timeframe so a lesson opens on its full history.

## Acceptance criteria

- [x] Indicator chart and structure cockpit draw the newest 600 candles
      through one helper (`lessonKlines`), with the BUG-0213/BUG-0248 guards
      applied.
- [x] Both ask the pager for 600 before registering; a mocked test pins the
      call.
- [x] The chart fits the full window once per symbol/timeframe and keeps the
      user's zoom afterwards.
- [x] Chart height grows to 288px from the `@md` container step
      (`h-64 @md:h-72`).
- [x] Five structure lessons compute over 600 candles without refusals
      (fixture).

## Out of scope

- Backfill policy changes in `historyFetcher` (per-chart depth stays the
  user's setting).
- New zoom controls or a bar-spacing preference.

## Links

- FEAT-0686 — the cockpit this deepens
- ADR-0022 — paging cache
- BUG-0213, BUG-0248 — the series guards `lessonKlines` centralises
