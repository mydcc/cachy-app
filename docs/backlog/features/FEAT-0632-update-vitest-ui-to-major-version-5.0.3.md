---
id: FEAT-0632
title: Update @vitest/ui to major version 5.0.3
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

# FEAT-0632 — Update @vitest/ui to major version 5.0.3

## Problem

@vitest/ui has a major update available from 4.1.11 to 5.0.3. This needs to be applied carefully to avoid breaking changes.

## Proposal

Update @vitest/ui to 5.0.3.

## Acceptance criteria

- [ ] @vitest/ui is updated to 5.0.3 in package.json
- [ ] CI passes (npm run check, npm test, npm run build)
- [ ] No regressions introduced by the breaking changes

## Out of scope

Refactoring code that is unrelated to the breaking changes of @vitest/ui.

## Open questions

What are the exact breaking changes in @vitest/ui 5.0.3?

## Links

- npm: https://www.npmjs.com/package/@vitest/ui
