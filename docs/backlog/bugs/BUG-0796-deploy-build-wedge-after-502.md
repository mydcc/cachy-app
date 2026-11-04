---
id: BUG-0796
title: A single 5xx from the releases API wedges every later deploy build
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
branch: fix/deploy-build-survive-transient-5xx
shipped: PR #4527
---

# BUG-0796 — A partial release upload blocks all subsequent builds

## Symptom

`deploy.sh --ci` on the staging host fails before it touches the application:

```
CI artifact: https://github.com/mydcc/cachy-app/releases/download/deploy-beta/cachy-build.tar.gz
curl: (22) The requested URL returned error: 404
❌ BUILD FAILED!
```

Nothing is deployed, and no amount of re-running `Deploy Build` fixes it — the
workflow fails in the same step every time. Staging stays on the last good
artifact until someone deletes the release by hand.

## Evidence

Demonstrated, on `develop` at `98c9be96a` (run `41818821620`), 2026-11-04.

`Deploy Build` succeeded at 11:03Z (`1.6.0-beta.514`). The next run
([`41818821620`](https://github.com/mydcc/cachy-app/actions/runs/41818821620))
snapshotted the current artifact into `deploy-beta-previous` at 11:09:13Z, then:

```
11:09:27Z  HTTP 502: Server Error (https://api.github.com/repos/mydcc/cachy-app/releases)
11:09:27Z  ##[error]Process completed with exit code 1.
```

`gh release create` creates the release first, uploads the asset second and
publishes last. The 502 landed in between, so the release stayed a **draft with
no asset**:

```
$ gh release view deploy-beta --json isDraft,assets
{"assets":[],"isDraft":true,"createdAt":"2026-11-04T11:09:17Z"}
```

From then on every run died one step earlier, in the snapshot block:

```
$ gh release download deploy-beta --pattern cachy-build.tar.gz --dir .deploy_prev
no assets to download
##[error]Process completed with exit code 1
```

`gh release download` exits non-zero when the release exists but carries no
matching asset, and the step runs under `bash -e`. The `if gh release view`
guard only proves the *release* exists, not that it has anything to download —
so the abort happened before the step's own `gh release delete` could clear the
broken release. Sixteen further runs failed this way (11:08Z–19:25Z).

A draft is also invisible to the anonymous download URL the host uses
(`releases/download/deploy-beta/cachy-build.tar.gz` → 404, because draft assets
need a token), so even a successful-looking run can produce an artifact URL
that 404s.

## Cause

Two independent defects in the `Publish artifact` step of
`.github/workflows/deploy-build.yml`:

1. **The snapshot is fatal.** `gh release download` is unguarded, so a release
   without the asset aborts the step instead of skipping a convenience.
2. **No recovery, no verification.** `gh release create` is attempted once; a
   transient 5xx is not retried, the leftover draft is never cleared, and the
   job never checks that what it published is actually published and
   anonymously fetchable.

## Fix

- Treat the rollback snapshot as best-effort: skip it with a `::warning::` when
  the current release has no artifact, and never let it abort the publish.
- Retry `gh release create` three times with backoff, deleting the leftover
  draft between attempts so a retry starts clean.
- Verify after publishing that the release is not a draft and carries
  `cachy-build.tar.gz`, so a silent draft fails the job instead of handing the
  host a 404.

## Acceptance criteria

- [x] A release that exists but has no asset no longer aborts the step
- [x] A persistently failing publish fails the job after 3 attempts, not 1
- [x] A publish that leaves a draft fails the job
- [x] The happy path still snapshots the previous artifact before overwriting

## Out of scope

- The `deploy.sh` side on the host (it only fetches a fixed URL; the script was
  fine — the release behind that URL was a draft).
- Pinning artifacts per commit instead of a moving tag — a larger change to how
  the host selects a build.
- The xyOps trigger in `deploy-staging.yml`.

## Links

- Incident run: `41818821620` (`Deploy Build`, 2026-11-04 11:08Z)
- First green run after the manual cleanup: `41896959133` (re-run, 20:30Z)
