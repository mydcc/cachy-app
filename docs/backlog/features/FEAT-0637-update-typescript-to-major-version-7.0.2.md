---
id: FEAT-0637
title: Update typescript to major version 7.0.2
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

# FEAT-0637 — Update typescript to major version 7.0.2

## Problem

typescript has a major update available from 6.0.3 to 7.0.2. This needs to be applied carefully to avoid breaking changes.

## Proposal

Update typescript to 7.0.2.

## Acceptance criteria

- [ ] typescript is updated to 7.0.2 in package.json
- [ ] CI passes (npm run check, npm test, npm run build)
- [ ] No regressions introduced by the breaking changes

## Out of scope

Refactoring code that is unrelated to the breaking changes of typescript.

## Open questions

What are the exact breaking changes in typescript 7.0.2?

## Links

- npm: https://www.npmjs.com/package/typescript
