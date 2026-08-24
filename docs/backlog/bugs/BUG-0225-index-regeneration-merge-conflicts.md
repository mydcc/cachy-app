---
id: BUG-0225
title: Regenerating INDEX.md per PR causes near-constant merge conflicts across parallel backlog PRs
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
start_date: 2026-08-17
target_date: 2026-08-17
size: XS
estimate: 1
---


# BUG-0225 — Regenerating INDEX.md per PR causes near-constant merge conflicts across parallel backlog PRs

## Symptom

Almost every pull request that touches `docs/backlog/**/*.md` conflicts with
`docs/backlog/INDEX.md` on merge, because `npm run backlog:check` (the PR CI
gate) required a fresh, exactly-matching committed copy of the index. Two
lines in the generated file change on **every single regeneration**,
regardless of which backlog item was actually edited:

```
Counts by status: 💡 idea 17 · 📋 specced 23 · 🟢 ready 3 · ✅ done 74
...
Next free number: **0225**
```

Any two backlog-touching PRs open at the same time — normal for a repo with
several agents working in parallel — collide on these two lines even when
their actual item edits are in completely different rows of the table.

## Evidence

**Demonstrated** — the maintainer reports this has recurred on roughly 60
pull requests, requiring a manual conflict-resolution nudge to whichever agent
merges second every time. It also compounded a separate, related incident in
the same session: two independent PRs (#2025, #2026) grooming the same two
backlog items (`FEAT-0222`, `BUG-0218`) in parallel, neither rebased onto the
other before opening — the same "parallel work, shared generated file, no
rebase discipline" root cause that also produced duplicate GitHub Issues
(#2018/#2020 for `FEAT-0222`, #2021/#2023 for `FEAT-0223`) via
`scripts/sync-github-issues.ts`'s now-fixed race condition.

## Cause

`docs/backlog/README.md`'s working procedure and `CLAUDE.md` both instructed
every agent to run `npm run backlog:index` and commit the result as part of
their own PR, and `.github/workflows/audit.yml`'s `docs-check` job failed the
build if the committed `INDEX.md` did not exactly match a fresh regeneration.
A file that is regenerated from the full directory listing on every edit —
and is required, fresh, on every PR — is a hot file by construction the
moment more than one such PR exists at once.

## Fix

Stop treating `INDEX.md` as something a PR carries at all; keep it, but make
it exclusively CI-maintained, in one place:

- `scripts/backlog-index.mjs --check` (`npm run backlog:check`, the PR gate)
  no longer reads or compares against a committed `INDEX.md`. It still
  validates front matter, id/filename agreement, duplicate ids, duplicate
  numbers and `depends_on` targets that don't exist — the checks that
  actually catch a real defect (including the id-collision case this same
  incident's duplicate-issue race could have produced).
- `.github/workflows/sync-backlog.yml` (already runs on every push to
  `develop`/`main` touching `docs/backlog/**/*.md`, already has the
  concurrency guard from `#2025`) gained two steps: regenerate the index,
  then commit and push it directly to the branch with `[skip ci]` if it
  changed. This is now the *only* place `INDEX.md` is ever committed.
- `docs/backlog/README.md`, `CLAUDE.md` and `docs/README.md` updated to tell
  agents plainly not to run `npm run backlog:index` and commit the result —
  there is no reason to any more, and doing so is how the conflicts happened.
- `.gitignore` gained an entry for `docs/backlog/INDEX.md`, mainly as a
  documented signal of intent — it does not by itself stop a commit to an
  already-tracked file, so the actual fix is the removed CI requirement and
  the updated instructions above, not the ignore rule.

## Follow-up: the commit step itself raced with other automation

Confirmed live, same day: the bot-commit step's plain `git push` was rejected
once — `semantic-release`'s own `chore(release): ... [skip ci]` commit landed
on `develop` between this job's checkout and its push, so `origin/develop`
had moved and the push failed outright (job marked failed, nothing merged —
no data loss, since the only local change was the regenerable `INDEX.md`).
`sync-backlog.yml` and `sync-backlog-full.yml` now retry: on a rejected push,
re-fetch `develop`, hard-reset to the new tip, regenerate `INDEX.md` again
against the fresh tree, and retry (up to 5 attempts, short backoff). Nothing
precious is ever at risk of being discarded — the working copy's only local
change is always the one generated file.

## Acceptance criteria

- [x] `npm run backlog:check` passes without a committed `INDEX.md` present
      at all
- [x] `npm run backlog:check` still fails on a duplicate id, a reused number,
      or a `depends_on` target that does not exist
- [x] Two backlog-item-only PRs (no shared file touched) merge into `develop`
      back to back with zero manual conflict resolution, proven by observing
      the next two real backlog PRs — verified live post-merge, no conflicts
- [x] `sync-backlog.yml`'s commit step successfully publishes a regenerated
      `INDEX.md` to `develop` after a real merge — verified live; first
      attempt hit push race with semantic-release, retry logic added and
      validated (PR #2034)
- [x] The existing duplicate issues (#2018/#2020, #2021/#2023) are resolved
      once the `cleanupDuplicateIssue` fix from PR #2026 also lands — completed
      via PR #2026 cleanup logic

## Out of scope

- The GitHub Issues duplicate-cleanup fix itself (`cleanupDuplicateIssue` in
  `scripts/sync-github-issues.ts`) — that is PR #2026, reviewed separately.
- Branch-protection changes (e.g. requiring a PR to be up to date with its
  base before merging) that would catch an id-number race at merge time
  rather than only via the existing post-merge `backlog:check` validation.
  Worth doing, but a GitHub repo-settings change, not a code change.
- Redesigning the shared sequential numbering scheme itself. The duplicate-id
  detection in `backlog:check` already catches a number collision once both
  files exist in the same tree; this item only removes the unrelated
  INDEX.md conflict source.

## Links

- `scripts/backlog-index.mjs` — the validator/generator this item changed
- `.github/workflows/audit.yml`, `.github/workflows/sync-backlog.yml`
- `docs/backlog/README.md`, `CLAUDE.md`, `docs/README.md`
- PR #2025, PR #2026 — the concrete parallel-work incident that surfaced this

## What shipped

Shipped in merge main into develop for release 1.6.1.
