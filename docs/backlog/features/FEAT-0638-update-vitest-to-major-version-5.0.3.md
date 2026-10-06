---
id: FEAT-0638
title: Update vitest to major version 5.0.3
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

# FEAT-0638 — Update vitest to major version 5.0.3

## Problem

vitest has a major update available from 4.1.11 to 5.0.3. This needs to be applied carefully to avoid breaking changes.

## Proposal

Update vitest to 5.0.3.

## Acceptance criteria

- [ ] vitest is updated to 5.0.3 in package.json
- [ ] CI passes (npm run check, npm test, npm run build)
- [ ] No regressions introduced by the breaking changes

## Out of scope

Refactoring code that is unrelated to the breaking changes of vitest.

## Open questions

What are the exact breaking changes in vitest 5.0.3?

## Links

- npm: https://www.npmjs.com/package/vitest
