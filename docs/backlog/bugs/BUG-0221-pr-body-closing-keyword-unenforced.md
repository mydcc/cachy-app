---
id: BUG-0221
title: A PR description can close the wrong issue and nothing catches it before merge
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: [BUG-0220]
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

Add a `pull_request: [opened, edited, synchronize]` job — in
`commit-lint.yml` alongside the existing commit check, or a new workflow — that
runs `scripts/lint-commit-refs.mjs` (or a small variant of it) against
`github.event.pull_request.body`, with one difference from the commit check:
the PR's own `Fixes #<issue>` line is expected and must be allowed. The rule is
not "no closing keyword anywhere in the body" — `CLAUDE.md` requires exactly
one, naming the issue this PR fixes — it is "no closing keyword pointing at any
*other* issue".

That needs the PR to declare which issue it fixes so the check has something to
compare against. Two ways to get there, either acceptable:

- Parse the required `Fixes #<issue>` line first (`CLAUDE.md` already mandates
  it be at the start of the description) and treat any *other* closing
  reference in the body as the violation.
- Reuse `decideLink`'s `conflict` result from `scripts/lib/pr-issue-match.ts` —
  it already expresses exactly this distinction for the sync script's own use.

**Left alone:** `scripts/lint-commit-refs.mjs` and its commit-message scope.
That check is about a surface (commit messages) that should carry no closing
keyword at all; this one is about a surface (PR descriptions) that must carry
exactly one, and needs to tell the legitimate one from an accidental second.
Different rule, not a relaxation of the first.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix: a PR body
      containing `Fixes #<own-issue>` *and* a closing reference to some other
      issue is rejected
- [ ] The test passes with the fix
- [ ] A PR body containing only the required `Fixes #<own-issue>` line passes
- [ ] The check runs on `opened`, `edited`, and `synchronize`, so an edit after
      the initial open is caught before merge, not only at creation
- [ ] Verified against both real incidents from `BUG-0220`'s pull request as
      fixtures: both are rejected

## Out of scope

- Anything already covered by `scripts/lint-commit-refs.mjs` (commit messages).
- Retroactively auditing already-merged PRs for wrong links — same scope note
  as `BUG-0220`, still a separate task if it turns out to matter.
- A GitHub App or bot that edits/corrects the PR body automatically. Failing
  the check and naming the problem is enough; auto-rewriting someone else's PR
  description is a different, riskier feature.

## Links

- [`BUG-0220`](BUG-0220-issue-autolink-substring-match.md) — where both
  incidents happened and where the "not covered" gap was first named
- `scripts/lib/pr-issue-match.ts` — `decideLink`, the conflict logic this item
  can reuse
- `scripts/lint-commit-refs.mjs` — the sibling check for commit messages
- `.github/workflows/commit-lint.yml` — where the new job likely belongs
- `CLAUDE.md`, `AGENTS.md` — the `Fixes #<issue>` requirement and the
  closing-keyword convention this item would enforce rather than merely state
