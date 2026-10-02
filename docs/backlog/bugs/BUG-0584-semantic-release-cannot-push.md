---
id: BUG-0584
title: semantic-release cannot push, so no release has shipped since 2026-09-20
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: ci
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: docs/bug-0584-close
shipped: 1.6.0-beta.365
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

## Progress 2026-10-01: a new fine-grained PAT is minted; AC3 is met

**The token was reminted, not repaired.** A second fine-grained PAT was created
2026-10-01 against this one repository with **Contents: Read and write** and
**Metadata: Read-only** — the minimum for the push, and enough for it. It has
since been stored as the `RELEASE_TOKEN` secret. What remains is AC1 and AC2.

**The docs PR that recorded the rotation did not exercise the new token, and
could not have.** `release.yml` carries `paths-ignore: ['docs/**', '**/*.md']`
(`:13–18`), so a docs-only merge produces no `Release` run at all — by design,
since semantic-release acts on `feat`/`fix`/`perf` commits only. The merge of
#3779 therefore left the pipeline exactly as broken as it was: the newest
`develop` Release run on record is still `36820921235` at `17b2a699` (2026-10-01
05:40 UTC), which predates the rotation and fails with the same
`EGITNOPERMISSION`. **AC1 and AC2 have still never been exercised against a
valid token**, and the tracking issue `#3767` remains open for that reason.

Two consequences worth keeping:

- **The verification trigger is the next non-docs push to `develop`**, not the
  next merge. That is also why `workflow_dispatch` on `Release` exists
  (`release.yml:19`) — it is the honest way to verify on demand, because it
  reads the current `develop` tip rather than a stale commit.
- **A green `Release` run also closes `#3767` automatically**, via the AC3
  watcher. So the alert issue is a second, independent signal that AC1 is met —
  one to watch while waiting, not two things to do.

**AC3 is met by the alert, not by a required check.** The AC demanded one of
the two, named. The named answer is the explicit failure alert:
`.github/workflows/release-failure-alert.yml` (merged in #3762), a
`workflow_run` watcher on `Release` that opens or bumps a tracking issue on
failure and closes it on recovery, with `issues: write` and no checkout.
`Release` is deliberately **not** on the required-checks list for `develop` —
the current list is `Conventional Commits`, `Closing References`,
`Decimal.js Enforcement`, `i18n String Compliance`, `Unit Tests`,
`TypeScript Type Check`, `ESLint`, `Backlog & Documentation Links`,
`check-translations`, `Stale Snapshot Revert Guard`. Making a beta-prerelease
job required would block every push to `develop` on release plumbing, which is
the wrong trade; the alert is the cheaper instrument and it is the one that
answers the actual failure mode here — a pipeline that fails quietly for days.

**The reminted PAT is scoped for `develop` only, and the next stable release
will need more.** `@semantic-release/github` is loaded on `main` alone
(`release.config.js:118`), and semantic-release authenticates its GitHub API
calls with the same `GITHUB_TOKEN` it pushes with. Since that environment
variable is the PAT, the job-level `permissions:` block — which grants
`issues: write` and `pull-requests: write` to the *workflow* token — does not
reach those calls. So on `develop` the gap is invisible (prerelease, plugin not
loaded), and the first release on `main` that tries to comment on its released
issues and pull requests would fail on the same shape as this bug: a valid
token missing a scope. Before that release, the PAT needs, in addition to
contents:

- **Issues: Write** and **Pull requests: Write** — for the released-issue and
  released-PR comments `@semantic-release/github` posts
- **Workflows: Write** — only if a release commit ever touches
  `.github/workflows/**`; GitHub rejects such a push outright otherwise.
  Unlikely, and the failure would be confusing rather than obvious.

This is recorded here rather than fixed, because widening the PAT is a human
action and because it is not this bug: no `develop` run reaches that code.

**Do not re-run the old failed runs to verify.** Re-running e.g. `36705838742`
would read the new secret, but semantic-release would compute the version from
that old commit and push `HEAD:develop` from it — a non-fast-forward against
everything `develop` has gained since, which fails with an unrelated error and
makes the diagnosis worse. Use `workflow_dispatch` on `Release` instead, or
wait for the next non-docs push.

## Progress 2026-10-01, 11:29 UTC: the token works. The block is `enforce_admins`.

The second PAT is valid. A `workflow_dispatch` of `Release` on `ded30410`
authenticated, reached the branch protection, and was refused there:

```
git push --tags https://x-access-token:[secure]@github.com/mydcc/cachy-app.git HEAD:develop
remote: error: GH006: Protected branch update failed for refs/heads/develop.
```

That is the second outcome this item predicted, and it is not the first: the
auth failure is gone, so `RELEASE_TOKEN` is no longer the problem. The
protection settings on `develop` are `enforce_admins: true`,
`required_status_checks: 10`, `strict: true`, and no required reviews. An admin
credential pushing directly therefore has to satisfy ten checks that have never
run for that commit — the `permissions:` block does not help, because that block
governs the workflow token's own API scopes, not branch protection.

**AC1 and AC2 are unreachable until the release lands by pull request** — not by
relaxing the protection. BUG-0582 enabled `enforce_admins` on 2026-09-28 after
four bot pull requests had replayed stale trees over `develop` and deleted 23
files; turning it back off would undo exactly that. `main` is unaffected by this
part: its `enforce_admins` is `false`, so the back-merge step there is a
separate question and not part of the prerelease failure.

## Fix

Read `.github/workflows/release.yml` and compare its job-level `permissions:`
and its `actions/checkout` step against a run that last succeeded
(2026-09-14, `v1.6.0-beta.311`). The regression is somewhere in that
difference.

Decide separately whether the version bump to `package.json` should survive a
failed tag push, or whether the whole job should abort before touching the
working tree.

## Acceptance criteria

- [x] A push to `develop` produces a green `Release` run — **met 2026-10-02**:
      run `36978404735` went green on `release/beta` after the sync carried the
      fixes there, and tracking issue `#3767` closed itself via the AC3 watcher.
      The pipeline had been re-plumbed by then: the prerelease runs on
      `release/beta` (a mirror of `develop` no protection touches) and reaches
      `develop` as a pull request
- [x] A new tag appears on the remote, and its commit is an ancestor of
      `develop` — **met 2026-10-02**: `v1.6.0-beta.365` (`6fde285d6`) was
      published and merged to `develop` as #3793 (merge, not squash;
      `git merge-base --is-ancestor` confirmed). The eight-day backlog landed
      as a single beta bump
- [x] `Release` is either a required check on `develop` or has an explicit
      failure alert, so a dead release pipeline cannot go unnoticed for days
      again. One of the two, named — not a "consider" — **met by the explicit
      failure alert**: `.github/workflows/release-failure-alert.yml`, merged in
      #3762
- [ ] Before the next stable release on `main`, `RELEASE_TOKEN` also carries
      Issues: Write and Pull requests: Write, because
      `@semantic-release/github` authenticates with the PAT rather than the
      workflow token — see *Progress 2026-10-01*. **Still open, human action**:
      carried to `docs/TODO.md` so it survives this item closing
- [x] The prerelease reaches `develop` as a pull request that the ten required
      checks actually run on, rather than as a direct push refused with `GH006`
      — **met 2026-10-02**: #3793 ran all ten required checks green and merged
      via auto-merge (`MERGE`, not squash, so the tag keeps naming an ancestor
      of `develop`)

## Out of scope

- Changing the `RELEASE_TOKEN || GITHUB_TOKEN` expression. The token is valid;
  changing the expression would only hide the failure mode where a future
  set-but-invalid secret silently takes precedence again
- Widening the PAT's scopes now. Two of the three scopes AC4 names
  (`Issues: Write`, `Pull requests: Write`) are only reachable from the stable
  release path on `main`, which no `develop` run enters; the PAT cannot be
  changed by an agent in any case
- Tagging or releasing manually to catch up the eight-day backlog. That is a
  release-management decision, not this fix
- Touching `semantic-release` config, commit-analyzer settings, or the
  `main`/`develop` release split

## Progress 2026-10-02: shipped as 1.6.0-beta.365, item done

Three stacked defects each sufficed to keep the pipeline broken; all three were
found by running the pipeline, not by reading it:

1. `sync-release-branch.yml` carried the Release workflow's `paths-ignore`, so
   a push whose only code was under `.github/workflows/` never reached
   `release/beta` — every release-pipeline fix sat on `develop` while the next
   release versioned the old configuration (#3789: filter removed, docs-only
   case answered in the job instead).
2. The sync step exported the secret as `SYNC_TOKEN`, which `gh` does not read
   (`gh` authenticates from `GH_TOKEN`/`GITHUB_TOKEN` only). Four consecutive
   syncs died at `gh pr list` with exit 4, including the pushes that carried
   the channel fix, the `gh pr create` fix and the tag fix (#3790).
3. The version guard from #3788 compared `package.json` against the highest tag
   — the value committed by the previous release, equal to the highest tag by
   definition, so it refused every release including the ones it protected
   (#3791: replaced by `release-guard.js`, a `verifyRelease` plugin checking
   `nextRelease.version`; #3792: the hook signature is `(pluginConfig,
   context)`, not `(context)` — `normalize.js:26` binds options first).

Plus the channel fix itself (#3786: `channel: "develop"` so the counter resumes
at `.365` instead of restarting at `.1`), the `gh pr create --json` fix (#3783),
and the tag hygiene (`git push --tags` carries deploy tags along; the release
drops them locally first, #3788).

Verified end to end, not by assertion: run `36978404735` computed
`1.6.0-beta.365`, the guard passed it against the 465 tags in the checkout,
the tag was published, and #3793 merged it to `develop` (merge, tag confirmed
an ancestor). First release since 2026-09-20.

AC4 (PAT scopes for the stable path on `main`) is deliberately left open and
carried to `docs/TODO.md` — it is a human action no agent can perform.

## Links

- `docs/TODO.md` — a human decision belongs here, not only in the backlog
