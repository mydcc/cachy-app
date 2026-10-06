---
id: FEAT-0635
title: Update negotiator to major version 1.1.0
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

# FEAT-0635 — Update negotiator to major version 1.1.0

## Problem

negotiator has a major update available from 0.6.4 to 1.1.0. This needs to be applied carefully to avoid breaking changes.

## Proposal

Update negotiator to 1.1.0.

## Acceptance criteria

- [ ] negotiator is updated to 1.1.0 in package.json
- [ ] CI passes (npm run check, npm test, npm run build)
- [ ] No regressions introduced by the breaking changes

## Out of scope

Refactoring code that is unrelated to the breaking changes of negotiator.

## Open questions

What are the exact breaking changes in negotiator 1.1.0?

## Links

- npm: https://www.npmjs.com/package/negotiator
