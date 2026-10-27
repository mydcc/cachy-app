---
id: FEAT-0744
title: Major dependency updates
type: feature
status: specced
assignee: none
branch: none
priority: P3
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
---

# FEAT-0744 — Major dependency updates

## Problem

There are several major dependency updates available that were not applied during the routine weekly dependency update pass because they represent breaking changes (according to SemVer) and require human review or explicit instruction.

## Proposal

The following packages have major updates available:

- `conventional-changelog-conventionalcommits`: 9.3.1 -> 10.4.1
- `katex`: 0.18.10 -> 0.19.1
- `typescript`: 6.0.3 -> 7.0.2

Investigate each major version bump, review their changelogs and migration guides, and apply them individually or in logical groups, ensuring no regressions.

## Acceptance criteria

- [ ] `conventional-changelog-conventionalcommits` is updated to 10.x.x.
- [ ] `katex` is updated to 0.19.x.
- [ ] `typescript` is updated to 7.x.x.
- [ ] All tests pass after applying the updates.

## Out of scope

- Application of these updates to the codebase directly without human review or explicit testing.
- Updates to `svelte` / `svelte-check` / `svelte-eslint-parser` because they cause issues with strict `$props` typings that are out of scope for the deps lane.
