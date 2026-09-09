---
id: BUG-0427
title: worktree-cleanup.sh refuses squash-merged branches as unmerged
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: tooling
data_class: none
adr: none
depends_on: []
---

# BUG-0427 — worktree-cleanup.sh refuses squash-merged branches as unmerged

## Symptom

`bash scripts/worktree-cleanup.sh <branch>` answers `refused — not merged
into origin/develop` for branches whose PR is merged, so finished worktrees
pile up instead of being retired.

## Evidence

**Demonstrated** (2026-09-09): all three local worktree branches are merged
via PR, all three are refused:

- `fix/bug-0423-coalesce-account-fetch` → PR #2795 MERGED, refused
- `chore/backlog-cleanup` → PR #2792 MERGED, refused
- `chore/bug-0414-triage-note` → PR #2796 MERGED, refused

`scripts/worktree-cleanup.sh --all` reports `0 retirable, 3 kept`.

## Cause

`check()` in `scripts/worktree-cleanup.sh` (~line 84) only tests true
ancestry (`git merge-base --is-ancestor "$branch" "$BASE"`). A squash-merge
creates a new SHA on `develop`, so the branch tip is never an ancestor —
even though the change is fully merged. The script header promises
squash-merge detection via PR state, the code has none.

## Fix

Teach `check()` a second merge test before refusing: squash-merged via a
GitHub PR (precedent: #2791 retired squash-merged worktrees via PR state,
e.g. `gh pr list --head "$branch" --state merged`), or patch-id equality
(`git patch-id`) between the branch diff and `develop` as a `gh`-free
fallback. Refusal reasons for truly unmerged branches stay untouched, no
`--force` anywhere.

## Acceptance criteria

- [ ] The three branches above retire cleanly once their PRs are merged
- [ ] A genuinely unmerged branch is still refused with `not merged into`
- [ ] A dirty worktree is still refused (no `--force` path added)
- [ ] `--all` (report-only) output format is unchanged

## Out of scope

- `--all --apply` behaviour; Gortex untrack logic; anything outside `check()`

## Links

- `scripts/worktree-cleanup.sh` (`check()`, ~line 76)
- PR #2791 (PR-state retirement precedent)
