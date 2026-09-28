---
id: BUG-0584
title: semantic-release cannot push, so no release has shipped since 2026-09-20
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: ci
data_class: none
adr: none
depends_on: []
---

# BUG-0584 — semantic-release cannot push; no release since 2026-09-20

## Symptom

Every push to `develop` has failed the `Release` workflow since 2026-09-20.
The last tag that reached the remote is `v1.6.0-beta.364` (2026-09-20 18:49
UTC). Eight days of merged work, including all 33 PRs of the last two days,
are unreleased and no failure was noticed.

## Evidence

**Demonstrated** — the workflow log, not inferred.

`gh run list --workflow=Release` returns an unbroken run of `failure` for
`develop` from 2026-09-25 through 2026-09-28, and the last `success` is
2026-09-14. On run `36448633871` (the merge of #3720), `semantic-release` gets
as far as pushing the version tag and then:

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

Unknown. The error is a credential/permission problem inside the workflow's own
`checkout`/`GITHUB_TOKEN` configuration, not inside the repository's code. The
usual causes are a `permissions:` block on the job or workflow that omits
`contents: write`, or a `persist-credentials: false` on the checkout step so the
push has no credential at all. Both are worth checking; guessing is not.

Note that the run *reaches* the push, so `verifyConditions` and the version
computation both succeed. Whatever is wrong is narrowly in the push path.

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
- [ ] A deliberately failing push is visibly red, so this cannot go unnoticed
      for eight days again — consider making `Release` a required check or
      alerting on its conclusion

## Links

- `docs/TODO.md` — a human decision belongs here, not only in the backlog
