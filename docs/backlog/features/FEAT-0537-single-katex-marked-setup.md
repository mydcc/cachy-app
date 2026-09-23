---
id: FEAT-0537
title: Unify the double KaTeX marked setup into one place
type: feature
status: done
done_version: 1.6.0-beta.364
assignee: opencode
branch: feat/0537-single-katex-setup
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
parent: FEAT-0341
size: S
estimate: 2
---

# FEAT-0537 — Unify the double KaTeX marked setup into one place

## Problem

`marked.use(markedKatex({…}))` is configured twice with identical options on the
same global `marked` instance: `src/utils/markdownUtils.ts:23` and
`src/services/markdownLoader.ts:119` (`markdownLoader` already imports
`ensureKatexCss` from `markdownUtils`, so the two modules are coupled anyway).
A future option change in one place silently leaves the other behind, and the
double registration relies on `marked.use` being idempotent.

## Proposal

One module owns the KaTeX setup (`markdownUtils`, which already owns
`ensureKatexCss`); the other consumes it without re-registering. Rendered
output must be unchanged.

## Acceptance criteria

- [ ] Exactly one `marked.use(markedKatex(…))` call site remains
- [ ] `markdownLoader.test.ts` and `markdownUtils.test.ts` pass
- [ ] Rendered KaTeX output verified unchanged (existing snapshot/golden tests, or a before/after render diff)

## Out of scope

- Lazy-loading or bundle changes (FEAT-0359, done); CSS changes
- Changing which markdown features are enabled

## Open questions

None blocking. If the builder finds the ownership should be reversed
(`markdownLoader` owns, `markdownUtils` consumes), that is acceptable — the
single-owner property is what matters.

## Links

- `src/utils/markdownUtils.ts`, `src/services/markdownLoader.ts`
- Context (done, no dependency): `FEAT-0359`
- Parent epic: `FEAT-0341`
