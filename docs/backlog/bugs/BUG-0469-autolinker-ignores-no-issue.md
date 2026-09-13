---
id: BUG-0469
title: The sync's PR auto-linker prepends Fixes #N to bodies that opt out with [no issue]
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
assignee: claude-code
branch: fix/bug-0469-autolinker-ignores-no-issue
start_date: 2026-09-13
---

# BUG-0469 — The PR auto-linker ignores `[no issue]`

## Symptom

On 2026-09-13 the backlog sync prepended `Fixes #3225` to five open PRs
(#3265, #3267, #3272, #3275, #3276). Every one of them said `[no issue]` on
line 1. Four of them only advance FEAT-0446, whose mirror issue is already
closed. With a line-start closing trailer in the body, the flip gate expects
the PR to move FEAT-0446 to `done`, which only the last PR does. That leaves
two possible outcomes for the other four:

- a red check, or
- a merge that claims to close an epic it only advanced.

## Root cause

Two functions in `scripts/lib/pr-issue-match.ts` read the same body with
different rules:

- `checkBodyHasClosingRef`, the presence gate, treats `[no issue]` as an opt-out.
- `decideLink`, the auto-linker, never looked for the marker.

On top of that, `ensurePRsAreLinked` in `scripts/sync-github-issues.ts`
prepended for every decision it did not name. Any decision added later
would have written to the body too.

## Fix

- **One reading of the marker.** `optsOutOfIssue()` is used by both the gate
  and the linker.
- **New outcome.** `decideLink` returns `opted-out` for such a body.
- **Fail closed.** The sync loop writes only on an explicit `prepend`.

## Acceptance criteria

- [x] `decideLink` returns `opted-out` for a body containing `[no issue]`, in any case.
- [x] The presence gate and the linker share one marker check.
- [x] The sync loop does not write a body for any decision other than `prepend`.
- [x] Regression test uses the incident's body shape.

## Follow-up done by hand

The five PR bodies were restored by hand on 2026-09-13. Until this merges,
the next sync run can add the line again.
