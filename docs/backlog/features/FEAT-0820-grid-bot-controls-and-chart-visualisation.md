---
id: FEAT-0820
title: Add grid bot controls and chart visualisation
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: [FEAT-0819]
parent: FEAT-0805
size: M
estimate: 5
---

# FEAT-0820 — Add grid bot controls and chart visualisation

## Problem

Even with a grid runtime, a trader cannot see or steer a ladder: the orders tab
would show a dozen unrelated-looking resting orders, the chart would show no
levels, and there would be no single control to pause or stop the grid.

## Proposal

A grid surface built on the runtime from FEAT-0819:

- **Control panel:** range, level count, spacing, size/budget, trend filter,
  stop-out; start, pause, resume, stop. Validation before start, with the
  estimated budget and fee exposure shown.
- **Chart:** grid levels as horizontal lines (via `PriceLineManager`), filled
  levels distinguished from resting ones, and the current position marker.
- **Orders:** the resting orders are grouped under the grid in the orders tab,
  not listed as independent manual orders; the group is one row that expands.
- **Bot row:** the Bots tab shows the grid's state, level progress
  (`filled / total`), accumulated position and PnL; no duplicate PnL source.
- **Stop confirmation:** stopping a grid asks once and states what will be
  cancelled and closed.

## Acceptance criteria

- [ ] A grid can be configured, started, paused, resumed and stopped from the
      panel; each action is reflected in the Bots tab and the orders group.
- [ ] The chart shows every level in the range, marks filled levels, and removes
      them when the grid stops.
- [ ] The orders tab groups the ladder under one row; expanding shows the
      individual orders with their level and owner.
- [ ] The Bots tab row shows state, `filled / total`, owned position and PnL;
      the position row remains the single money source.
- [ ] Stopping asks for confirmation naming the orders to cancel and the position
      to close.
- [ ] The panel is keyboard reachable, labelled, and the strings exist in both
      locales.
- [ ] Component tests cover start/pause/stop, the chart lines, the grouped
      orders and the empty state.

## Out of scope

- The runtime and its correctness (FEAT-0819).
- Drag-to-define a range on the chart; numeric inputs first.
- Multi-grid portfolio views.
- Live execution.

## Open questions

- Whether grid levels are a chart drawing the trader can edit, or a read-only
  overlay. Proposal: read-only in this item; editing comes later if the runtime
  supports moving a live ladder.
- Whether the orders group expands by default. Proposal: collapsed, with the
  level count in the summary.

## Links

- [`ADR-0027`](../../adr/0027-a-grid-bot-owns-an-order-set-and-its-position.md)
- [`FEAT-0819`](FEAT-0819-grid-bot-runtime-on-the-paper-account.md)
- Code: `src/services/chart/priceLineManager.ts`,
  `src/components/shared/PositionsSidebar.svelte`,
  `src/components/alerts/bots/BotsTab.svelte`
