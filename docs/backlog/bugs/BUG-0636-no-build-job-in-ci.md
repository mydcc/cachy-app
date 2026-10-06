---
id: BUG-0636
title: CI never builds, so a dependency bump that breaks the server bundle passes every check
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ci
data_class: none
adr: none
depends_on: []
# assignee:
---

# BUG-0636 — CI never builds, so a broken server bundle passes every check

## Symptom

A change that breaks `npm run build` can be merged green. Nothing in the check
set compiles the app, so the only signal is a local run that a reviewer may not
do — and on a dependency bump the reviewer has no reason to suspect it.

The production server is then the first place the defect appears: it starts,
fails to open its port, and the deploy rolls back.

## Evidence

*Demonstrated*, twice, one day apart.

**2026-10-06, deploy incident.** The SvelteKit 3 migration reached the server as
a bundle importing `HandledHttpError` from `@sveltejs/kit/internal`, which does
not exist in the installed Kit 2. `SyntaxError` before `listen()`, port 3002
never opened, health check failed after 90 s, rollback. Build had been green.

**2026-10-06, PR #3903.** `jsdom` was installed with `-D`, landing in
`devDependencies`. That made Vite bundle jsdom's CommonJS into the ESM SSR
chunk and the build failed with `__dirname is not defined in ES module scope`.
Every other check in the PR — unit tests, ESLint, type check, the full test
suite — passed. Nothing noticed.

A second, server-side consequence of the same placement: `deploy.sh` installs
with `npm ci --omit=dev`, so jsdom would have been absent at runtime and both
modules importing it (`src/lib/server/sanitizer.ts`,
`src/routes/api/external/article-content/+server.ts`) would have failed to load.
No check covers that either.

## Cause

There is no build job in the check set. `npm run build` is a local and
pre-release step, which is fine for source changes and wrong for dependency
changes: the bundle shape is exactly what a version bump alters.

## Proposed fix

A workflow that triggers when `package.json` or `package-lock.json` changes:

1. `npm ci`
2. `npm run build`
3. start the built server on a spare port, poll `/api/health` until it answers
4. fail the job if the build fails or the server does not become healthy

Step 3 is the part that matters and the part that is easy to leave out. A green
build is not evidence of a healthy server — the deploy incident above had a
green build and a dead port. Step 3 needs a bounded timeout so a hang fails
rather than stalls the job.

Keep it out of the way of the existing checks: it is slow, and it only needs to
run for dependency changes.

## Acceptance criteria

- [x] A workflow runs `npm run build` when `package.json` / `package-lock.json`
      change in a PR
- [x] The built server is started and `/api/health` is polled to a bounded
      timeout
- [x] A deliberately broken build fails the job
- [x] The job is not required for source-only PRs

## What shipped

`.github/workflows/pr-build.yml` — triggers on `pull_request` limited to
`package.json`, `package-lock.json`, `vite.config.ts` and `.node-version`, so
source-only PRs do not pay for it. It uses `node-version-file: .node-version`
rather than a floating major, because the point is to verify what the deploy
will actually run. No Rust toolchain: `scripts/build_wasm.sh` keeps the
committed artifacts, and the WASM module is not what a dependency bump puts at
risk.

The boot check was verified in all three directions before the workflow was
merged, against a real local build:

| case | result |
|---|---|
| real build | `healthy after 2 attempt(s)`, exit 0 |
| entry point exits during startup (the 2026-10-06 shape) | `::error::the built server exited during startup` plus the server log with the `ReferenceError`, exit 1 |
| entry point hangs and never answers | `::error::the built server never answered /api/health within 90s`, exit 1 |

The second row is the one the first incident would have produced. A workflow
that has only ever reported success is not a check.

## Open questions

- Does the WASM build step need Rust available for this job, or are the
  committed `static/wasm/` artifacts enough? `scripts/build_wasm.sh` keeps them
  when no toolchain is present, so the job should be fine either way — but that
  is untested on CI.

## Links

- `deploy.sh`, `.github/workflows/`
- Related: BUG-0634 groundwork in `docs/backlog/features/FEAT-0634-upgrade-jsdom-to-30.md`
