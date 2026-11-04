---
id: BUG-0798
title: The manual Deploy Build trigger can publish any branch to the shared deploy tags
type: bug
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: ci
data_class: none
adr: none
depends_on: []
---

# BUG-0798 — A workflow_dispatch run from a feature branch overwrites deploy-beta

## Symptom

No error. Someone starts `Deploy Build` manually on a feature branch, the run
goes green, and `deploy-beta` (plus `deploy-beta-previous`) now carry a build of
that branch. The next `deploy.sh --ci` on staging ships it, because the host
downloads a fixed tag and has no way to tell which commit produced it.

The host's own record of what it deployed becomes wrong, and the rollback
artifact points at a build nobody reviewed.

## Evidence

Derived. Two pieces of code disagree:

`.github/workflows/deploy-build.yml`:

```yaml
on:
  push:
    branches: [main, develop]
  workflow_dispatch:
```

`workflow_dispatch` has no branch filter, and the only job-level guard is

```yaml
if: "!contains(github.event.head_commit.message, '[skip ci]')"
```

at the top of the job, which does not look at `github.ref`. The publish step
then picks the tag purely from the ref:

```bash
if [ "${{ github.ref }}" = "refs/heads/main" ]; then TAG="deploy-stable"; else TAG="deploy-beta"; fi
```

Anything that is not `main` — including `feature/…` — publishes over
`deploy-beta`.

`.github/workflows/deploy-staging.yml` does gate on the branch
(`github.event.workflow_run.head_branch == 'develop'`), so an accidental run
will not auto-deploy. The exposure is the artifact itself: it stays published
under the tag the host uses, and the next manual deploy picks it up. The
freshness check in `deploy-staging.yml` compares `target_commitish`, which will
match the feature branch's commit, so nothing in CI flags it.

## Cause

The trigger accepts a ref the publish logic does not expect, and the tag
selection treats "not main" as "beta" instead of "the two branches this
workflow builds".

## Fix

Guard the job on the refs the workflow actually serves:

```yaml
  build:
    name: Build artifact
    runs-on: ubuntu-latest
    if: >
      (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop') &&
      !contains(github.event.head_commit.message, '[skip ci]')
```

`workflow_dispatch` remains usable for re-publishing from either branch, which
is its actual purpose; it just cannot be pointed at anything else.

Consider also refusing in the publish step, so a future trigger cannot bypass
the guard:

```bash
case "${{ github.ref }}" in
  refs/heads/main)   TAG="deploy-stable" ;;
  refs/heads/develop) TAG="deploy-beta" ;;
  *) echo "::error::refusing to publish ${{ github.ref }} to a deploy tag"; exit 1 ;;
esac
```

## Acceptance criteria

- [ ] A `workflow_dispatch` run started from a feature branch is skipped, not
      published
- [ ] Dispatch from `develop` and `main` still publishes to `deploy-beta` and
      `deploy-stable` respectively
- [ ] The publish step refuses an unexpected ref instead of defaulting to beta

## Out of scope

- Pinning artifacts per commit. That would remove the moving-tag ambiguity
  entirely, but it changes how the host selects a build (see BUG-0797).
- Tag protection rules on `deploy-beta` / `deploy-stable`. Worth a thought, but
  it would also block the workflow's own pushes unless the app is allowlisted.

## Links

- BUG-0796 — the publish step this guard belongs to
