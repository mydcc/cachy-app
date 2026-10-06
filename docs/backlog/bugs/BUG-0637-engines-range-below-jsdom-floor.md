---
id: BUG-0637
title: engines admits Node versions that production dependencies reject
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
# assignee:
---

# BUG-0637 — `engines` admits Node versions that production dependencies reject

## Symptom

`package.json` declares `engines.node: ">=22.19.0"`. After the jsdom 30 bump
(FEAT-0634), `jsdom@30.1.2` requires `^22.22.2 || ^24.15.0 || >=26.0.0`. So the
declared range promises support for Node 22.19.0 through 22.22.1, on which
`npm ci` emits `EBADENGINE` and the server may fail at runtime on a jsdom code
path.

Nothing breaks today: `.node-version` is pinned to 26.8.1 and the CI
`node-version` job enforces that exact pin. The defect is that the published
range is now wrong, not that a running install is broken.

## Evidence

*Derived* from two declarations disagreeing:

- `package.json` → `"engines": { "node": ">=22.19.0" }`
- `jsdom@30.1.2` → `engines.node: "^22.22.2||^24.15.0||>=26.0.0"`

The disagreement is derivable from reading the two files. It has not been
observed as a runtime failure, because the pin keeps CI and the deploy server on
26.8.1.

## Cause

`engines` was written once and not revisited as dependencies moved. Each bump
can narrow the real constraint without anyone re-reading the accumulated floor.

## Proposed fix

Align the range with the strictest production dependency:

```
"node": "^22.22.2 || ^24.15.0 || >=26.0.0"
```

and add a check that keeps it honest — the dependency set has several packages
with engine constraints, so the next bump will drift again otherwise.

Note per the Jules sandbox rules: `.node-version` and `engines` are raise-only.
This change raises both, never lowers them.

## Acceptance criteria

- [ ] `engines.node` matches the strictest floor among production dependencies
- [ ] `.node-version` still satisfies `engines`, and is raised if needed
- [ ] A check or note keeps `engines` from drifting below a dependency again

## Open questions

- Should the range be derived automatically from the lockfile, or pinned by hand
  with a check that compares? Deriving it risks a range that changes on any
  transitive bump, which is noisy; pinning needs the check to be trustworthy.

## Links

- `package.json`, `.node-version`
- Introduced by FEAT-0634 (`docs/backlog/features/FEAT-0634-upgrade-jsdom-to-30.md`)
