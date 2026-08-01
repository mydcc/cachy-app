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
depends_on: [FEAT-0027]
---

# FEAT-0029 — Alerts on chart drawings

## Problem

Traders mark support, resistance and channels on the chart. Those lines are
where the decisions are, and nothing watches them.

## Proposal

Alerts bound to drawing objects — horizontal lines, trend lines, channels — that
fire when price touches or crosses the drawing, including sloped lines whose
trigger level moves with time.

**Requires persistent, addressable drawing objects, which do not exist yet.**
That prerequisite is the bulk of the work and should probably be its own item
once the charting approach is settled. Left as `idea` until then.

## Acceptance criteria

- [ ] Drawings persist across reload and are individually addressable
- [ ] An alert on a horizontal line fires on crossing
- [ ] An alert on a sloped line uses the level at the current time, tested at
      two different times
- [ ] Moving a drawing moves its alert
- [ ] Deleting a drawing removes or clearly orphans its alert — decide which
- [ ] Definitions stay local

## Links

- [`FEAT-0027`](FEAT-0027-alert-engine.md)
- `src/lib/windows/implementations/CandleChartView.svelte`
