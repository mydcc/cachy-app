---
id: FEAT-0744
title: Major dependency updates
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
---

# FEAT-0744 — Major dependency updates

## Problem

Three dependencies have a new major version, which the routine minor/patch pass
deliberately skips: a major bump is a breaking change by definition and needs
its changelog and migration guide read before anything else happens.

## Proposal

| Package | Current | Major available |
| --- | --- | --- |
| `conventional-changelog-conventionalcommits` | 9.3.1 | 10.4.1 |
| `katex` | 0.18.10 | 0.19.1 |
| `typescript` | 6.0.3 | 7.0.2 |

Investigate each in turn — read its changelog and migration guide, apply it on
its own branch, and keep the app building and the suite green after every step.

`npm outdated` also reported `@semantic-release/changelog`,
`@semantic-release/git` and `jsdom` as "latest lower than current". They are not
updates: the registry's `latest` for each equals the version already in
`package.json` (7.0.0, 11.0.1 and 30.1.3 respectively). Nothing to do for those
three, and no "latest is lower than current" mystery to chase.

## Acceptance criteria

- [ ] `conventional-changelog-conventionalcommits` is updated to 10.x.x.
- [ ] `katex` is updated to 0.19.x.
- [ ] `typescript` is updated to 7.x.x, or the concrete blocker is written down
      in this item.
- [ ] `npm run check` reports 0 errors and `npm run test:unit` passes after each
      bump.
- [ ] The KaTeX-rendered surfaces still render: `src/utils/markdownUtils.ts` is
      the only consumer of `katex`/`marked-katex-extension`, reached through the
      `markdown` action, `MarkdownView.svelte` and the academy formula pages.

## Out of scope

- Applying the three bumps in one go; each gets its own branch and review.
- The routine minor/patch dependency pass, which ships as its own PR.
- The two audit findings in npm's own bundled `undici` (6.29.0) and
  `ip-address` (10.7.2). They live under `node_modules/npm/node_modules/`, not in
  the app's tree, and cannot be fixed from this repository. The app's own copies
  resolve to `undici` 6.29.1 / 7.30.1 / 8.12.3, all outside the vulnerable
  range.
