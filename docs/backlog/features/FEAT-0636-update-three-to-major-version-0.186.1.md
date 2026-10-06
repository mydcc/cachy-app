---
id: FEAT-0636
title: Update three to major version 0.186.1
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

# FEAT-0636 — Update three to major version 0.186.1

## Problem

three has a major update available from 0.185.1 to 0.186.1. This needs to be applied carefully to avoid breaking changes.

## Proposal

Update three to 0.186.1.

## Acceptance criteria

- [ ] three is updated to 0.186.1 in package.json
- [ ] CI passes (npm run check, npm test, npm run build)
- [ ] No regressions introduced by the breaking changes

## Out of scope

Refactoring code that is unrelated to the breaking changes of three.

## Open questions

What are the exact breaking changes in three 0.186.1?

## Links

- npm: https://www.npmjs.com/package/three
