---
id: BUG-0797
title: The deploy URL returns 404 while the artifact is being republished
type: bug
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: ci
data_class: none
adr: none
depends_on: []
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

Primary, small: make the download outlast the window.

```bash
curl -fL --retry 6 --retry-delay 10 --retry-all-errors \
    --connect-timeout 20 --max-time 600 \
    -o "$WORK_DIR_TMP/cachy-build.tar.gz" "$CI_ARTIFACT_URL"
```

`--retry-all-errors` is what makes a 404 retryable, and `--retry-delay 10` with
6 attempts covers roughly a minute. Keep `--max-time 600` per attempt so a hung
connection still fails.

Alternative, larger: publish to a staging tag and swap the tag after the upload,
so the download URL never points at nothing. Only worth it if the window causes
real trouble; the retry above costs one line.

## Acceptance criteria

- [ ] A 404 on the artifact URL is retried for at least ~60 s in total
- [ ] A genuinely missing artifact still fails with the current message, after
      the retries rather than immediately
- [ ] The failure text names the tag and the URL, so a real 404 from a wrong
      `CI_ARTIFACT_TAG` is not mistaken for the publish window

## Out of scope

- `deploy-build.yml`'s publish order. It is correct for its own failure modes
  (BUG-0796); changing it trades one window for another.
- `deploy-staging.yml`. It waits for the build run to finish, so it never sees
  the window.

## Links

- BUG-0796 — the wedged-release failure this one is often mistaken for
