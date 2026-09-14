---
id: BUG-0470
title: worktree-cleanup.sh retires a fresh task worktree that has no commits yet
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: tooling
data_class: none
adr: none
depends_on: []
---

# BUG-0470 — worktree-cleanup.sh retires a fresh task worktree that has no commits yet

## Symptom

On 2026-09-14 at 11:14 the brand-new worktree
`.claude/worktrees/feat-0454-indicator-source` and its branch were removed
about three minutes after creation, before the first commit. The most likely
trigger is another session running `worktree-cleanup.sh --all --apply`.

## Cause

`check()` treated a worktree as merged when
`git merge-base --is-ancestor "$branch" origin/develop` succeeded. A branch
with zero commits of its own sits on a develop commit, so it is an ancestor
and passed. The live-session guard did not help: `index-worktree.sh` had
failed to register the worktree with Gortex, and `has_active_session` only
sees cwds that Gortex reports.

A second hole sat next to it: `is_pr_merged` matched the branch *name* only.
A backlog branch name reused for a follow-up task, or a squash-merged branch
that gained commits after the merge, also read as merged — and `retire()`
then force-deleted the branch with `-D`.

## Fix

- `is_unworked`: a branch whose tip lies on origin/develop's first-parent
  line never received a commit and is refused. A merge-commit merge brings
  a worked tip in as a second parent, so it stays retirable.
- `is_pr_merged` requires a merged PR whose `headRefOid` equals the local tip.
- `--abandon <branch|path>` retires an unworked worktree on explicit request;
  it refuses branches with commits and never runs from `--all`.

## Acceptance criteria

- [x] A fresh worktree with no commits is refused, by name and in `--all --apply`
- [x] A fresh worktree cut from an older develop commit is refused
- [x] A fresh branch reusing a merged PR's branch name is refused
- [x] A squash-merged branch with post-merge commits is refused
- [x] Squash-merged (PR head matches) and merge-commit merged branches still retire
- [x] `--abandon` retires an unworked worktree and refuses one with commits

## Links

- `scripts/worktree-cleanup.sh` (`check()`, `is_unworked`, `is_pr_merged`)
- `scripts/worktree-cleanup.squash.test.ts`
- [BUG-0427](BUG-0427-worktree-cleanup-misses-squash-merges.md) (squash-merge detection)
