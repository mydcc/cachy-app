---
id: FEAT-0630
title: Update @sveltejs/kit to major version 3.0.0
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

# FEAT-0630 — Update @sveltejs/kit to major version 3.0.0

## Problem

@sveltejs/kit has a major update available from 2.70.3 to 3.0.0. This needs to be applied carefully to avoid breaking changes.

## Proposal

Update @sveltejs/kit to 3.0.0.

## Acceptance criteria

- [ ] @sveltejs/kit is updated to 3.0.0 in package.json
- [ ] CI passes (npm run check, npm test, npm run build)
- [ ] No regressions introduced by the breaking changes

## Out of scope

Refactoring code that is unrelated to the breaking changes of @sveltejs/kit.

## Open questions

What are the exact breaking changes in @sveltejs/kit 3.0.0?

## Links

- npm: https://www.npmjs.com/package/@sveltejs/kit
