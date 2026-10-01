---
id: BUG-0584
title: semantic-release cannot push, so no release has shipped since 2026-09-20
type: bug
status: in-progress
priority: P1
milestone: none
editions: [community, pro, private]
area: ci
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0584 — semantic-release cannot push; no release since 2026-09-20

## Symptom

Every push to `develop` has failed the `Release` workflow since 2026-09-20.
The last tag that reached the remote is `v1.6.0-beta.364` (2026-09-20 18:49
UTC). Eight days of merged work, including all 33 PRs of the last two days,
are unreleased and no failure was noticed.

## Evidence

**Demonstrated** — the workflow log, not inferred.

`gh run list --workflow=Release` returns `failure` for every `develop` run on
record inspected — the four most recent are 2026-09-28 16:06, 15:22, 15:03 and
14:50 UTC, at `e0fd8cfab`, `d0b5c7bf4`, `9358fde21` and `d4df8bb92`. On run
`36448633871` (the merge of #3720), `semantic-release` gets as far as pushing
the version tag and then:

    ✘ The command "git push --dry-run --no-verify -- https://x-access-token:***@github.com/mydcc/cachy-app.git HEAD:develop"
      failed with the error message remote: Invalid username or token.
      Password authentication is not supported for Git operations.
    EGITNOPERMISSION Cannot push to the Git repository.

`git ls-remote --tags origin` confirms `v1.6.0-beta.364` (2026-09-20) is the
newest tag, and `package.json` on `develop` reads `1.6.0-beta.364` — so
`develop`'s version field has not moved either.

Nothing in `docs/backlog/` covers this, and no `docs/TODO.md` entry records
it.

## Cause

Settled from the workflow, not guessed. Three lines in
`.github/workflows/release.yml` decide it:

- The job's `permissions:` block **already grants `contents: write`**, so the
  usual "missing permission" hypothesis is ruled out.
- `checkout` runs with `persist-credentials: false`, so the push has no
  credential from the checkout step and depends entirely on the token passed
  in the environment.
- That token is supplied as
  `GITHUB_TOKEN: ${{ secrets.RELEASE_TOKEN || secrets.GITHUB_TOKEN }}`.

`||` falls back **only when `RELEASE_TOKEN` is empty**. `RELEASE_TOKEN` is set,
so it is sent; it is invalid, so the push authenticates as the PAT and fails.
The logged URL confirms the PAT path was taken — the request user is
`x-access-token`, not the workflow's own identity, which is what the `||` branch
would have produced.

A set-but-invalid secret therefore fails *harder* than an absent one, because
the fallback never fires. Note the run *reaches* the push, so
`verifyConditions` and the version computation both succeed; the fault is
narrowly in the push path.

## Progress

`RELEASE_TOKEN` was rotated on 2026-09-28. The run list has not exercised the
new value yet — the four most recent `Release` runs on `develop` all predate
it, and they all still fail with `EGITNOPERMISSION`. What remains is therefore
verification, not diagnosis: AC1 and AC2 below.

## Progress 2026-09-30: still the same auth error, rotation did not take

The 11:00 UTC run (`36705838742`) fails identically: `git push --dry-run …
HEAD:develop` → "Invalid username or token" → `EGITNOPERMISSION`. The error is
authentication, not permission — a valid token with insufficient scope would
fail differently — so `RELEASE_TOKEN` is still set-but-invalid. The 2026-09-28
rotation did not take effect (wrong value stored, or stored under conditions
that do not reach the workflow). **Human action: re-verify the secret value in
the repo settings** (fine-grained PAT with contents access); agents cannot see
or mint it.

A local `git push --dry-run origin HEAD:develop` with a real diff is accepted,
so ref permission for an admin identity is fine. Whether the *real* push then
clears the required status checks under `enforce_admins` (on since BUG-0582,
2026-09-30 — the old "disabled" comment in `release.yml` was stale and is
corrected in this PR) is deliberately left to the next real run instead of
rebuilding the flow on a hypothesis: if it goes green, only the token was bad;
if it answers GH006, the release flow must become PR-based.

This PR's scope, therefore: the AC3 alert (a `workflow_run`-triggered watcher
that opens/bumps/closes a tracking issue — no checkout, no code), the stale
comments, and this item update. No change to the `||` expression, no
semantic-release config change, no flow rebuild. AC1/AC2 verify when this PR
itself merges — that merge triggers the next `Release` run.

## Fix

Read `.github/workflows/release.yml` and compare its job-level `permissions:`
and its `actions/checkout` step against a run that last succeeded
(2026-09-14, `v1.6.0-beta.311`). The regression is somewhere in that
difference.

Decide separately whether the version bump to `package.json` should survive a
failed tag push, or whether the whole job should abort before touching the
working tree.

## Acceptance criteria

- [ ] A push to `develop` produces a green `Release` run
- [ ] A new tag appears on the remote, and its commit is an ancestor of `develop`
- [ ] `Release` is either a required check on `develop` or has an explicit
      failure alert, so a dead release pipeline cannot go unnoticed for days
      again. One of the two, named — not a "consider"

## Out of scope

- Changing the `RELEASE_TOKEN || GITHUB_TOKEN` expression. The rotated token
  is valid; changing the expression would only hide the failure mode where a
  future set-but-invalid secret silently takes precedence again
- Tagging or releasing manually to catch up the eight-day backlog. That is a
  release-management decision, not this fix
- Touching `semantic-release` config, commit-analyzer settings, or the
  `main`/`develop` release split

## Links

- `docs/TODO.md` — a human decision belongs here, not only in the backlog
