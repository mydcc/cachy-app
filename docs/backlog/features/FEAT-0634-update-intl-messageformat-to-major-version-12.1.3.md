---
id: FEAT-0634
title: Update intl-messageformat to major version 12.1.3
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

# FEAT-0634 — Update intl-messageformat to major version 12.1.3

## Problem

intl-messageformat has a major update available from 11.2.15 to 12.1.3. This needs to be applied carefully to avoid breaking changes.

## Proposal

Update intl-messageformat to 12.1.3.

## Acceptance criteria

- [ ] intl-messageformat is updated to 12.1.3 in package.json
- [ ] CI passes (npm run check, npm test, npm run build)
- [ ] No regressions introduced by the breaking changes

## Out of scope

Refactoring code that is unrelated to the breaking changes of intl-messageformat.

## Open questions

What are the exact breaking changes in intl-messageformat 12.1.3?

## Links

- npm: https://www.npmjs.com/package/intl-messageformat
