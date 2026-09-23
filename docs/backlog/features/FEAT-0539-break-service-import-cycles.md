---
id: FEAT-0539
title: Break the service import cycles
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: architecture
data_class: none
adr: none
depends_on: []
parent: FEAT-0341
size: M
estimate: 5
---

# FEAT-0539 — Break the service import cycles

## Problem

Graph analysis reports two real dependency cycles. Cycles make import order
fragile, hide layering violations and turn every future refactor in these files
into a minefield:

1. `src/services/newsService.ts:10-11` imports `rssParserService` and
   `discordService`, while both import back (`rssParserService.ts:10`,
   `discordService.ts:10` — currently type-only `NewsItem` imports).
2. `src/utils/indicators.ts:31` imports values from `./slidingWindow`, which
   reaches back through `./indicatorTypes` (reported cycle — builder verifies
   both directions first and documents the actual edges).

## Proposal

One cycle per branch: determine the decoupling direction (interface, events, or
moving the shared type to a leaf module) and break it so the import graph is
acyclic in both spots. No behavior change.

## Acceptance criteria

- [ ] Cycle 1 broken: `newsService` no longer mutually imports `rssParserService`/`discordService`; direction documented in the PR
- [ ] Cycle 2 broken: `indicators`/`slidingWindow` imports are one-directional; actual edges documented
- [ ] Existing service and indicator test suites pass
- [ ] Import-graph check (e.g. `gortex analyze cycles`) shows no remaining cycle in these modules

## Out of scope

- Behavior changes in news/discord/RSS handling or indicator math
- The FEAT-0345 decimal.js migration — sequence this item before it, not parallel
  (`statefulTechnicalsCalculator.ts:29` imports `./indicators`, adjacent code)
- Splitting either cycle into its own item is allowed if it grows (split, don't expand)

## Open questions

None blocking. The chosen decoupling direction per cycle is the builder's call
and part of the PR description.

## Links

- `src/services/newsService.ts`, `rssParserService.ts`, `discordService.ts`
- `src/utils/indicators.ts`, `slidingWindow.ts`, `indicatorTypes.ts`
- Sequencing (not a dependency): `FEAT-0345` should follow this item
- Parent epic: `FEAT-0341`
