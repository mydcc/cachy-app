---
id: BUG-0447
title: A stale agent re-push on a PR branch silently reverts work already merged to develop
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
---

# BUG-0447 — A stale agent re-push on a PR branch silently reverts work already merged to develop

## Symptom

PR #3202 ("Palette: Fix hardcoded colors in DataMaintenance") was reviewed and merged
as a 10-line class change. What landed on `develop` as `68ffecfc` was 55 files,
+141 / −1981. Nobody saw it, CI passed, and five releases (1.6.0-beta.269 to .274)
shipped on top of it.

What it took out, all of it previously merged and released:

| Reverted | Came from | Effect while missing |
|---|---|---|
| `replayClosedCandles.ts`, `legacyReplayCoordinator.ts` and wiring | #3192 (BUG-0441) | a price alert whose target was crossed while the app was closed **never fires** again |
| `destroy()` disarm in `journal.svelte.ts` | #3196 (BUG-0442) | a torn-down journal store can still write Class A data to `localStorage` |
| consent, logger and news leaf providers (`loggerConfig.ts`, `newsSettings.ts`) | #3198, #3201, #3205 | `trackingService`, `logger` and `newsService` import the settings store directly again, and the services-to-stores allowlist in `eslint.architecture.boundaries.js` was widened back to permit it — behaviour unchanged, boundary lost |
| `--input-border-color` and dark-theme contrast | #3195, #3190 | a11y regressions across settings and modals |
| FEAT-0368 closure, BUG-0441 and BUG-0442 items | #3191, #3192 | a closed item back to `ready`, two bug records deleted |

## Evidence

**Demonstrated.** Reproduce against the PR ref:

```bash
git fetch origin pull/3202/head:refs/scratch/pr3202
git diff --stat 28641eba refs/scratch/pr3202^   # 1 file, DataMaintenance.svelte, 10 lines
git diff --shortstat refs/scratch/pr3202^ refs/scratch/pr3202   # 55 files, -1976
git diff --quiet 68ffecfc refs/scratch/pr3202 && echo identical
```

The branch had `develop` merged into it eleven times by `auto-update-prs.yml`, each
cleanly. Its parent-of-head (`17020ba8`) was exactly `develop` plus the intended change.
The final commit `a15c2185` carries the same message as the agent's original commit and
restores the agent's working tree from its original base `9b26ba43` — every file `develop`
had changed since that base, the agent's snapshot overwrote.

## Cause

Two individually reasonable mechanisms compose into a data-loss path:

1. `auto-update-prs.yml` keeps agent PR branches current by merging `develop` in.
2. The agent does not fetch those merges before its next push. It commits a full tree
   snapshot from its own stale checkout, which git records as an ordinary commit that
   happens to undo every merged change.

Squash-merge then flattens the result into one commit whose title describes only the
intended change. Review sees the title and the PR's first commit; CI sees a tree that
compiles and whose remaining tests pass, because the reverted tests were deleted along
with the code they tested.

## Fix

Content restored in the PR that files this item (reverse of `a15c2185` on current
`develop`; version fields and the generated backlog index kept from `develop`).

What remains is the mechanism, so the next snapshot push fails instead of merging:

- A PR check that fails when the PR diff (`base...head`) **deletes a file, or removes
  lines, introduced on the base branch after the PR's first commit**, unless the PR
  carries an explicit opt-in label. A palette PR has no business deleting
  `replayClosedCandles.ts`; this is decidable from git alone, with no heuristics about
  authorship.
- Cheaper complement: fail an agent-authored PR (`jules-*` head ref) whose diff touches
  files its first commit did not, beyond the generated backlog index.

Do not fix this by turning off `auto-update-prs.yml`: stale branches are what produces
conflicting backlog indices in the first place.

## Acceptance criteria

- [ ] A test reproduces the defect: a fixture repo where a branch re-commits a stale
      snapshot over merged base changes, and the check fails on it
- [ ] The check passes on an ordinary PR that was updated from base and only adds its
      own change
- [ ] The check runs on every PR to `develop` and is required for merge
- [ ] The opt-in for a deliberate revert is a visible label, not a commit-message token

## Links

- PR #3202 — the merge that carried the revert
- PR #3192, #3196, #3198, #3201, #3205, #3190, #3195, #3191 — the work it reverted
- `.github/workflows/auto-update-prs.yml` — the base-merging half of the mechanism
