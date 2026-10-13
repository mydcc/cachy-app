---
id: FEAT-0672
title: Apply major dependency updates for happy-dom and esbuild
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

# FEAT-0672 - Apply major dependency updates

## Problem
The following dependencies have major version updates available that were not applied automatically by the weekly update run due to the risk of breaking changes:
- `happy-dom`: 20.14.6 -> 21.0.1
- `esbuild`: 0.25.12 -> 0.28.2

(Other major updates like typescript, katex, and conventional-changelog-conventionalcommits are tracked in their own specific issues: FEAT-0224, FEAT-0641, BUG-0639)

## Proposal
Review the changelogs/migration guides for these major releases, address any breaking changes, and apply the updates.

## Acceptance criteria
- [ ] Dependencies updated successfully
- [ ] Tests pass
- [ ] Application builds correctly
