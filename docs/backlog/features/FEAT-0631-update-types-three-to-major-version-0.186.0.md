---
id: FEAT-0631
title: Update @types/three to major version 0.186.0
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

# FEAT-0631 — Update @types/three to major version 0.186.0

## Problem

@types/three has a major update available from 0.185.4 to 0.186.0. This needs to be applied carefully to avoid breaking changes.

## Proposal

Update @types/three to 0.186.0.

## Acceptance criteria

- [ ] @types/three is updated to 0.186.0 in package.json
- [ ] CI passes (npm run check, npm test, npm run build)
- [ ] No regressions introduced by the breaking changes

## Out of scope

Refactoring code that is unrelated to the breaking changes of @types/three.

## Open questions

What are the exact breaking changes in @types/three 0.186.0?

## Links

- npm: https://www.npmjs.com/package/@types/three
