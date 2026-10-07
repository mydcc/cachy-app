---
id: FEAT-0646
title: Catch backlog claims whose branch already merged, and release four stale ones
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/enforce-branch-on-in-progress
---

## Problem

Four backlog items sat on `status: in-progress` with `assignee: opencode`,
naming a branch whose pull request had **already merged**. Per AGENTS.md every
agent must stop when an item is `in-progress` and the assignee is someone else,
so these four were blocked for everyone — including their own assignee, who was
not working on them.

| Item | Blocked on |
| --- | --- |
| BUG-0576 | IDEA-0620 — live verification needs a human with exchange keys |
| BUG-0597 | same |
| BUG-0598 | same |
| FEAT-0335 | FEAT-0070 — the Bitunix trailing-stop endpoint does not exist |

## Why no check caught it

`check-backlog-flip.ts` requires that a PR closing an issue whose label names a
backlog item also flips that item to `done`. It exits 0 when the PR carries no
closing trailer.

The common shape slips through: a PR **opens a new item** with
`status: in-progress` and carries `[no issue]`, because there is no issue yet.
Nothing before the merge can notice — `in-progress` is correct while the PR is
open. The flip is simply forgotten afterwards.

Observed twice in one session, on FEAT-0643 and FEAT-0644. Both shipped, both
sat claimed, and nothing said so.

## Fix

A check on the merged state rather than the pre-merge state:
`scripts/check-stale-in-progress.mjs`, wired as a step in the `docs-check` job
(`Backlog & Documentation Links`) and as `npm run backlog:check:stale`.

For every `in-progress` item it resolves the claimed branch — front matter
`branch:` or the older body `Branch:` line, first token, so FEAT-0335's
parenthetical prose does not break it — and asks GitHub for a merged PR with
that head branch. One found means the claim is stale.

It fails closed: without `GH_TOKEN`/`GITHUB_TOKEN` the merged-PR lookup cannot
run, and a backlog gate that silently passes is the exact failure this check
exists to prevent. Infrastructure failure is reported as such, never as a pass.

## The measurement that nearly made this the wrong change

The first plan was to require a `Branch:` line on every `in-progress` item, on
the grounds that only 19 of 523 items carried one. That count was wrong — it
searched the body form only. The dominant convention is `branch:` in front
matter, carried by **196** items.

Had the check shipped as designed it would have flagged four *compliant* items
and, once corrected to accept both forms, found **zero** violations. A check
that never fires is worse than none: it reads as a guard and protects nothing.
The count came from a partial search, and the plan would have been built on it.

The four items were not missing their branch. They were blocked, and had said
nothing about it.

## Verification

- Mutation proof: setting BUG-0598 back to `in-progress` with its branch makes
  the check exit 1 with the item, the branch and the merged-PR count named.
  Reverted, exit 0.
- Exit codes checked directly: 1 without a token (fail closed), 0 when clean.
- All four branch names resolve to exactly one merged PR each, verified
  against the real API before the check was written.
- `npm run backlog:check` green, index regenerated.

## Out of scope

Changing `check-backlog-flip.ts`. The pre-merge check cannot catch this case, so
extending it would have added a guard that fires on nothing.

Also out of scope: deciding what the four items need next. BUG-0576, BUG-0597
and BUG-0598 now say `ready` and FEAT-0335 says `specced`, which reflects that
they wait on a human and on a non-existent endpoint respectively. The exchange
area keeps the first three out of the Jules dispatch pipeline.