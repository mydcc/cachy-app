---
id: FEAT-0743
title: Major dependency updates
type: feature
status: ready
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

# FEAT-0743 — Major dependency updates

## Problem

There are several major dependency updates available that were not applied during the routine weekly dependency update pass because they represent breaking changes (according to SemVer) and require human review or explicit instruction.

## Proposal

The following packages have major updates available:

- `@semantic-release/changelog`: 7.0.0 -> 6.0.3 (Note: latest is lower than current in `npm outdated`, possibly a tagged version issue, needs checking)
- `@semantic-release/git`: 11.0.1 -> 10.0.1 (Note: latest is lower than current)
- `conventional-changelog-conventionalcommits`: 9.3.1 -> 10.4.1
- `jsdom`: 30.1.3 -> 29.1.1 (Note: latest is lower than current)
- `katex`: 0.18.10 -> 0.19.1
- `typescript`: 6.0.3 -> 7.0.2

Investigate each major version bump, review their changelogs and migration guides, and apply them individually or in logical groups, ensuring no regressions. (Note: some "latest" versions appear to be lower than "current", this is likely due to how tags are configured on those packages on npm and should be carefully reviewed).

## Acceptance criteria

- [ ] `conventional-changelog-conventionalcommits` is updated to 10.x.x.
- [ ] `katex` is updated to 0.19.x.
- [ ] `typescript` is updated to 7.x.x.
- [ ] Verify why some packages have latest versions lower than current, and address if necessary.
- [ ] All tests pass after applying the updates.
