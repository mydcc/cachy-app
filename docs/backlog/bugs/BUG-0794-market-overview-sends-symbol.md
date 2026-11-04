---
id: BUG-0794
title: MarketOverview sends the trading pair with every tracked click
type: bug
status: ready
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: C
adr: ADR-0001
depends_on: []
assignee: none
branch: none
---

# BUG-0794 — MarketOverview puts the symbol into the Matomo payload (W1-10/B12)

## Symptom

Every tracked click in the market overview carries the currently displayed
pair. Two paths hand it to the analytics service:

- `data-track-context={JSON.stringify({ symbol })}` on five elements, which
  `GlobalTracker.svelte:44-52` parses and passes as the interaction context,
- five direct `trackInteraction(id, "click", { symbol })` calls.

AGENTS.md Class C: public market data may live anywhere but "never next to a
user identity. What symbols someone watches is user data."

## Evidence

Found while reviewing BUG-0791 (same audit item, W1-10/B12, same rule). Sites
in `src/components/shared/MarketOverview.svelte`:

| Line | What |
|---|---|
| 509 | `data-track-context` on the symbol header |
| 540, 544 | context attribute + `trackInteraction("btn-toggle-technicals", …)` |
| 561, 564 | context attribute + `trackInteraction("btn-open-chart", …)` |
| 590, 593 | context attribute + `trackInteraction("btn-refresh-stats", …)` |
| 880, 883 | context attribute + `trackInteraction("btn-toggle-favorite", …)` |

`GlobalTracker.svelte:44-52` merges the parsed context into the Matomo event.

`BUG-0778` already reduced other dimensions of the same class (it removed the
"currently viewed pair" from the app-level context in `app.ts`), so this is the
remaining surface of one decision, not a new one.

## Cause

The context attribute was a convenient place to carry "what this click was
about". At the time the element was added, nothing distinguished
"which control was pressed" from "which market it was pressed on".

## Fix

- Drop `symbol` from the five `data-track-context` attributes (the attribute
  can go entirely where it carries nothing else).
- Drop the `{ symbol }` argument from the five `trackInteraction` calls, or
  replace it with a non-identifying value if the interaction genuinely needs
  context (e.g. the control's own id, which is already the first argument).
- Guard it the way BUG-0791 guards the setup panel: a structural scan that
  fails on a `symbol` key in a tracking context under `src/components/`, with
  a self-check proving the rule flags a sample.

## Acceptance criteria

- [ ] No tracked element in `MarketOverview.svelte` sends the pair, neither via
      `data-track-context` nor via a `trackInteraction` argument
- [ ] The five interactions still reach Matomo without the pair
- [ ] The guard fails on the current file before the fix and passes after

## Out of scope

- Whether `GlobalTracker`'s heuristic path (button inner text) leaks anything:
  it captures labels, not market data.
- Removing the analytics integration itself.

## Links

- `src/components/shared/MarketOverview.svelte`
- `src/components/shared/GlobalTracker.svelte`
- `docs/backlog/bugs/BUG-0791-trade-setup-telemetry-sends-symbol.md`
- `docs/backlog/bugs/BUG-0778-telemetry-class-a-fields.md`
