---
id: FEAT-0029
title: Alerts on chart drawings
type: feature
status: idea
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0027, FEAT-0480]
start_date: 2026-08-01
target_date: 2027-03-15
size: S
estimate: 2
---


# FEAT-0029 — Alerts on chart drawings

## Problem

Traders mark support, resistance and channels on the chart. Those lines are
where the decisions are, and nothing watches them.

## Proposal

Alerts bound to drawing objects — horizontal lines, trend lines, channels — that
fire when price touches or crosses the drawing, including sloped lines whose
trigger level moves with time.

**Its prerequisite is now its own item.**
[`FEAT-0480`](FEAT-0480-persistent-chart-drawings.md) builds the persistent,
addressable drawing objects an alert hangs on, and `depends_on` above names it
— so the blocker lives in front matter, where a listing and
`scripts/jules/dispatch-backlog.mjs` both see it, instead of in a paragraph
only a reader finds. This item stays `idea` until that one is done. What it
owns is the alert, not the drawing.

## Acceptance criteria

- [ ] An alert on a horizontal line fires on crossing
- [ ] An alert on a sloped line uses the level at the current time, tested at
      two different times
- [ ] Moving a drawing moves its alert
- [ ] Deleting a drawing disables its alert with a reason the panel shows, and
      deletes neither the rule nor its fired history
- [ ] Definitions stay local

## Decision: what deleting a drawing does to its alert (2026-09-18)

The criterion above used to end in "removes or clearly orphans its alert —
decide which". Deciding it: **the rule is disabled and says why. It is not
deleted, and it does not keep firing.**

Deleting the rule throws away work the drawing never owned — a rule carries a
note, a validity period and a fired history — and a line is easy to remove by
accident. Leaving it armed on the drawing's last level is worse than either: it
would fire on a threshold that is no longer on the chart, the kind of
unverifiable trigger the rule system refuses everywhere else. Disabling keeps
the work, stops the firing, and leaves something the trader can re-anchor to a
new line.

## Links

- [`FEAT-0027`](FEAT-0027-alert-engine.md)
- [`FEAT-0480`](FEAT-0480-persistent-chart-drawings.md) — the drawing objects
  this waits on
- `src/lib/windows/implementations/CandleChartView.svelte`

## Scope boundary (added 2026-09-04)

[`FEAT-0395`](FEAT-0395-alert-entry-points.md) covers the chart right-click and
indicator-settings entry points for **price and indicator** alerts. This item owns
alerts anchored to a **drawing** — a trendline, a level, a channel — where the
threshold moves with the object. Both land in the panel from
[`FEAT-0389`](FEAT-0389-super-alert-panel.md).
