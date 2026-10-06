---
id: FEAT-0629
title: Update @sveltejs/adapter-node to major version 6.0.0
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

# FEAT-0629 — Update @sveltejs/adapter-node to major version 6.0.0

## Problem

@sveltejs/adapter-node has a major update available from 5.5.7 to 6.0.0. This needs to be applied carefully to avoid breaking changes.

## Proposal

Update @sveltejs/adapter-node to 6.0.0.

## Acceptance criteria

- [ ] @sveltejs/adapter-node is updated to 6.0.0 in package.json
- [ ] CI passes (npm run check, npm test, npm run build)
- [ ] No regressions introduced by the breaking changes

## Out of scope

Refactoring code that is unrelated to the breaking changes of @sveltejs/adapter-node.

## Open questions

What are the exact breaking changes in @sveltejs/adapter-node 6.0.0?

## Links

- npm: https://www.npmjs.com/package/@sveltejs/adapter-node
