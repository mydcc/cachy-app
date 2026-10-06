---
id: FEAT-0633
title: Update conventional-changelog-conventionalcommits to major version 10.4.1
type: feature
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
---

# FEAT-0633 — Update conventional-changelog-conventionalcommits to major version 10.4.1

## Problem

conventional-changelog-conventionalcommits has a major update available from 9.3.1 to 10.4.1. This needs to be applied carefully to avoid breaking changes.

## Proposal

Update conventional-changelog-conventionalcommits to 10.4.1.

## Acceptance criteria

- [ ] conventional-changelog-conventionalcommits is updated to 10.4.1 in package.json
- [ ] CI passes (npm run check, npm test, npm run build)
- [ ] No regressions introduced by the breaking changes

## Out of scope

Refactoring code that is unrelated to the breaking changes of conventional-changelog-conventionalcommits.

## Open questions

What are the exact breaking changes in conventional-changelog-conventionalcommits 10.4.1?

## Links

- npm: https://www.npmjs.com/package/conventional-changelog-conventionalcommits
