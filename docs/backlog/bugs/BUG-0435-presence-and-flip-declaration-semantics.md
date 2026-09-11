---
id: BUG-0435
title: The body lint mutates the description and the two gates disagree on what it declares
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ci
data_class: none
adr: none
depends_on: []
---

# BUG-0435 — The body lint mutates the description and the two gates disagree on what it declares

## Symptom

The `Closing References` job still rewrites the PR description it validates, and
its two steps use different notions of "the reference this PR declares":

- The presence check accepts a closing keyword anywhere
  (`closingReferences`); the flip gate only a line-start trailer. A `Closes #N`
  written inline satisfies presence, so the flip gate never checks whether the
  item was flipped — the issue can close on merge while the backlog item stays
  open.
- The auto-fix inserts a `Fixes #N` trailer, so CI edits the artifact another
  step in the same job validates. That is the mechanism behind BUG-0431.

## Evidence

**Derived.** `scripts/lib/pr-issue-match.ts` (`checkBodyHasClosingRef`) calls
`closingReferences`, which matches a closing keyword anywhere in the body,
while `scripts/lib/backlog-flip.ts` (`findClosingTrailer`) anchors the pattern
at the line start. BUG-0431's fix made the two agree for line-start trailers
only.

## Cause

Two independent definitions of "the declared trailer", plus a repair step that
adds closing power instead of only removing it.

## Fix

- Introduce one declaration function — line-start, any closing keyword,
  code-block stripped — and use it in both the presence check and the flip
  gate.
- Reduce the auto-fix to what is strictly safety-increasing: neutralize stray
  closing references; never add a closing trailer. A missing trailer fails with
  guidance and is written by the author (or the authoring agent).
- Distinguish a failed issue search from "no such issue", so a persistent
  lookup failure never appends `[no issue]` and silently opts a PR out of
  closing an issue that exists (the BUG-0307 drift in reverse).

## Acceptance criteria

- [ ] Presence and the flip gate call the same declaration function
- [ ] An inline-only closing keyword no longer satisfies presence
- [ ] The auto-fix never adds a closing trailer; it only neutralizes strays
- [ ] A failed issue search does not append `[no issue]`
- [ ] The BUG-0220 prose protection still holds (no trailer inferred from prose)

## Links

- [ADR-0017](../adr/0017-required-ci-gates-fail-closed-after-bounded-retry.md)
- `scripts/lib/pr-issue-match.ts`, `scripts/lib/backlog-flip.ts`
- BUG-0431
