---
id: BUG-0797
title: The deploy URL returns 404 while the artifact is being republished
type: bug
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: ci
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/bug-0797-artifact-download-retry
---

# BUG-0797 — A deploy started during the publish window fails on a 404

## Symptom

`deploy.sh --ci` on the staging or production host can fail with

```
curl: (22) The requested URL returned error: 404
❌ BUILD FAILED!
```

although the artifact exists and is published moments later. Re-running the
deploy succeeds. Nothing is broken; the run simply landed inside the window in
which the moving release is being replaced.

## Evidence

Demonstrated by construction, in `.github/workflows/deploy-build.yml` after
BUG-0796: the `Publish artifact` step first deletes the release and its tag
(`gh release delete "$TAG" --yes --cleanup-tag`) and only then creates the new
one. Between those two API calls the fixed URL
`https://github.com/<owner>/<repo>/releases/download/<tag>/cachy-build.tar.gz`
resolves to nothing.

The window is short but not negligible: one API round trip for the delete, plus
the create. A failed create extends it by the retry backoff (10 s and 20 s), so
worst case is roughly a minute.

`deploy.sh` (`CI_MODE` branch, around line 760) already retries, but only for
transient failures:

```bash
curl -fL --retry 3 --connect-timeout 20 --max-time 600 \
    -o "$WORK_DIR_TMP/cachy-build.tar.gz" "$CI_ARTIFACT_URL"
```

`--retry` does not retry a 404 by default, and the three attempts share ~7 s of
backoff — shorter than the window it would have to outlast.

This is the same user-visible failure as BUG-0796, with a harmless cause. It is
recorded separately because the cause and the fix are unrelated: BUG-0796 was a
wedged release, this is a moving tag with no overlap.

## Cause

Delete-then-create on a moving tag, plus a client that treats 404 as final.

## Fix

Landed: a `download_ci_artifact` helper in `deploy.sh` that waits out the
window and classifies the failure.

The card originally proposed the `--retry-all-errors` one-liner. It was not
used, for two reasons: `curl --retry-all-errors` retries *every* error, so a
401/403 (wrong token, private repo) would also sit for a minute before saying
anything; and it needs curl ≥ 7.71, which turns a missing option on an older
host into an immediate `exit 2`.

The helper instead retries only transient answers — 404 (the publish window),
429, 5xx and transport failures — and fails at once on anything else:

```bash
download_ci_artifact() {
    local url="$1" out="$2" tag="$3"
    local max_wait="${CI_DOWNLOAD_MAX_WAIT:-75}"
    local delay="${CI_DOWNLOAD_DELAY:-10}"
    local part="${out}.part"
    ...
    case "$code" in
        404|429|5??) ;;  # publish window, rate limit, server-side hiccup
        *) ... return 1 ;;
    esac
}
```

The wait budget is wall-clock (`CI_DOWNLOAD_MAX_WAIT`, default 75 s), not an
attempt count, so one slow attempt cannot multiply the total. The body is
written to `<out>.part` and renamed only after a complete 200, so an
interrupted attempt can never be extracted as a valid archive.

Verification (run before the merge, not in CI — no CI job executes shell
tests): the function was extracted from `deploy.sh` and driven against a local
HTTP stub, four scenarios, 21 assertions — 404×2 → 200 succeeds and leaves no
`.part`; persistent 404 fails inside the budget with tag, URL and status in the
message; 403 fails on the first attempt and says it is not the window; 503×2 →
200 succeeds. Removing `404` from the retry case makes the first scenario fail,
which is what pins the behaviour.

The larger alternative — publish to a staging tag and swap the tag after the
upload, so the URL never points at nothing — stays unused. It would trade this
window for a different one inside the workflow, which is exactly what BUG-0796
fixes.

## Acceptance criteria

- [x] A 404 on the artifact URL is retried for at least ~60 s in total
- [x] A genuinely missing artifact still fails with the current message, after
      the retries rather than immediately
- [x] The failure text names the tag and the URL, so a real 404 from a wrong
      `CI_ARTIFACT_TAG` is not mistaken for the publish window

## Out of scope

- `deploy-build.yml`'s publish order. It is correct for its own failure modes
  (BUG-0796); changing it trades one window for another.
- `deploy-staging.yml`. It waits for the build run to finish, so it never sees
  the window.

## Links

- BUG-0796 — the wedged-release failure this one is often mistaken for
