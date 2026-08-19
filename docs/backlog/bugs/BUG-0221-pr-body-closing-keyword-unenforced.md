---
id: BUG-0221
title: A PR description can close the wrong issue and nothing catches it before merge
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: [BUG-0220]
start_date: 2026-08-16
target_date: 2026-08-16
size: XS
estimate: 1
---


# BUG-0221 — A PR description can close the wrong issue and nothing catches it before merge

## Symptom

A pull request's description carries a GitHub closing keyword pointing at an
issue the PR does not fix. Nothing in CI rejects it. If the PR merges, GitHub
closes that issue and advances the wrong Kanban card — the defect it names is
still there, but the board says otherwise.

## Evidence

**Demonstrated** — twice, on 2026-08-16, in the pull request written to fix
`scripts/sync-github-issues.ts`'s substring-matching bug (`BUG-0220`):

- The PR's own first description explained a prior incident with the sentence
  "the squash of #2003 closed #2002". `closed` is a GitHub closing keyword —
  `close`/`closes`/`closed`, `fix`/`fixes`/`fixed`, `resolve`/`resolves`/
  `resolved` all count, and only the position directly before the reference
  matters. The PR thereby acquired a closing reference to #2002, an unrelated,
  unfixed P1 it does not touch.
- The corrected description quoted that same phrase, in backticks, to explain
  what had gone wrong — and re-created the identical link a second time.

Both were caught by hand, via the issue's `closed_by_pull_requests` list, not
by any automated check. `scripts/lint-commit-refs.mjs` (added in `BUG-0220`)
would have caught either phrase had it appeared in a *commit* message; neither
did. Both were PR-description prose, a surface that script does not scan.

## Cause

`.github/workflows/commit-lint.yml` lints commit messages against the range
`base..head`. GitHub does not fire a workflow on a pull request body edit by
default — the closest available trigger is `pull_request: [edited]`, which is
not currently configured anywhere in this repo — so nothing re-checks the
description each time it changes, and nothing blocks a merge on its content.

The convention documented in `CLAUDE.md` / `AGENTS.md` (also added in
`BUG-0220`) covers this surface in principle, but a convention is instructions
for a human or an agent to follow correctly every time, with no check verifying
that they did. `BUG-0220` itself is direct evidence that is not enough: the
same author, aware of the rule, broke it twice in the hour after writing it
down, in the exact artifact (a PR description) the rule was written for.

## Fix

A new workflow, `.github/workflows/pr-body-lint.yml`, triggered on
`pull_request: [opened, edited, synchronize]` against `main` and `develop`. A
separate file from `commit-lint.yml` rather than a job added to it: that
workflow's existing trigger has no `types:` override, so it runs on the
default set (`opened`, `synchronize`, `reopened`) and does not need `edited` —
adding it there would re-run the unrelated Conventional Commits check on every
title or description tweak for no reason. Keeping the file separate meant the
working trigger did not need touching.

The check itself: `scripts/lint-pr-body-refs.ts` calls
`checkBodyForStrayClosingRefs`, a new function in `scripts/lib/pr-issue-match.ts`
next to `closingReferences` and `decideLink`. `CLAUDE.md` requires `Fixes
#<issue>` at the start of every description, and `closingReferences` already
returns references in first-seen order — so the first one *is* the declared
issue, and anything after it is a second, unintended link. A body with no
closing reference at all is a different rule's concern (whether the required
line is present) and passes here.

The PR body reaches the script through `env: PR_BODY:` in the workflow, not
interpolated into the `run:` script text. The body is attacker-controlled — any
PR author sets it — and `${{ github.event.pull_request.body }}` spliced
directly into a shell command is a documented GitHub Actions injection vector;
`env:` hands it to the process as data instead.

**Left alone:** `scripts/lint-commit-refs.mjs` and its commit-message scope.
That check is about a surface (commit messages) that should carry no closing
keyword at all; this one is about a surface (PR descriptions) that must carry
exactly one, and needs to tell the legitimate one from an accidental second.
Different rule, not a relaxation of the first.

## Acceptance criteria

- [x] A test reproduces the defect and fails without the fix: a PR body
      containing `Fixes #<own-issue>` *and* a closing reference to some other
      issue is rejected
- [x] The test passes with the fix
- [x] A PR body containing only the required `Fixes #<own-issue>` line passes
- [x] The check runs on `opened`, `edited`, and `synchronize`, so an edit after
      the initial open is caught before merge, not only at creation
- [x] Verified against both real incidents from `BUG-0220`'s pull request as
      fixtures: both are rejected — `checkBodyForStrayClosingRefs` in
      `scripts/lib/pr-issue-match.test.ts`, one case per incident, plus the
      escaped form of the same text passing

## Out of scope

- Anything already covered by `scripts/lint-commit-refs.mjs` (commit messages).
- Retroactively auditing already-merged PRs for wrong links — same scope note
  as `BUG-0220`, still a separate task if it turns out to matter.
- A GitHub App or bot that edits/corrects the PR body automatically. Failing
  the check and naming the problem is enough; auto-rewriting someone else's PR
  description is a different, riskier feature.
- Enforcing that the required `Fixes #<issue>` line is present at all. This
  check only rejects a *stray second* reference; a missing first one is a
  different, unenforced rule today, named but not built here.

## Links

- [`BUG-0220`](BUG-0220-issue-autolink-substring-match.md) — where both
  incidents happened and where the "not covered" gap was first named
- `scripts/lib/pr-issue-match.ts` — `checkBodyForStrayClosingRefs`, and
  `scripts/lib/pr-issue-match.test.ts` covering it with the real fixtures
- `scripts/lint-pr-body-refs.ts` — the CLI entry point the workflow runs
- `.github/workflows/pr-body-lint.yml` — the new workflow
- `scripts/lint-commit-refs.mjs`, `.github/workflows/commit-lint.yml` — the
  sibling check for commit messages, left as it was
- `CLAUDE.md`, `AGENTS.md` — the `Fixes #<issue>` requirement and the
  closing-keyword convention this item now enforces rather than merely states
