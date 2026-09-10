---
id: BUG-0429
title: Backlog sync reopens freshly closed issues before the auto-done flip lands
type: bug
status: done
assignee: opencode
priority: P1
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
---

# BUG-0429 — Backlog sync reopens freshly closed issues before the auto-done flip lands

## Symptom

After a PR with a `Fixes #N` trailer merges, the linked issue's Kanban card
goes Done → In Progress → Done, and the issue itself is briefly reopened by
`github-actions[bot]` — before the `bot/backlog-auto-done` PR sets it back
to Done minutes later.

## Evidence

**Demonstrated** — observed live on #2753 (merge of #2924, 2026-09-09):

- `22:17:26Z` issue closed by merge → Projects workflow sets Status Done.
- `22:17:27Z` both `sync-backlog.yml` (push, file still `in-progress`) and
  `backlog-auto-done.yml` (PR closed) start.
- `22:18:38Z` sync PATCHes the issue: `reopened` + `status:in-progress`
  label + Kanban → In Progress (issue timeline API).
- Later the auto-done PR #2925 merges → sync converges → Done.

## Cause

Two writers with no ordering: the sync treats "file says `in-progress`,
issue is closed" as drift and converges it — including `state: open` —
while the auto-done flip is still in flight on its own branch. The
already-in-sync skip check (`sync-github-issues.ts`, `createOrUpdateIssue`)
cannot catch this because the states genuinely differ at that moment.

## Fix

- Merge-window guard in the sync: a freshly closed issue (`closed_at`
  within `BACKLOG_MERGE_GRACE_MS`, default 15 min) with a not-yet-done file
  is skipped entirely (no PATCH, no Kanban round trip). Pure decision
  function in `scripts/lib/closed-issue-guard.ts` so it stays unit-testable
  (the sync script exits at import without a token — see BUG-0307).
- Auto-merge (`--auto --squash`) for the auto-done PR so the flip lands as
  soon as checks pass, shrinking the window the guard must cover.

Deliberately unchanged: genuine rework (close older than the window, file
back to `in-progress`) still converges fully, including the reopen; a
missing/unparseable `closed_at` also converges (self-heals instead of
stranding the item).

## Acceptance criteria

- [ ] A closed issue with an `in-progress` file closed 2 min ago is skipped (no PATCH, no Kanban call)
- [ ] A closed issue with a `done` file still converges to Done
- [ ] A days-old closed issue with an `in-progress` file still converges (rework path intact)
- [ ] The auto-done PR enables auto-merge on creation; failures only log, never fail the run
- [ ] ESLint clean on all touched files; new + neighbouring lib tests green

## Out of scope

- Serializing the two workflows via shared concurrency groups (event order
  push-vs-closed is not guaranteed — brittle).
- A never-reopen rule for closed issues (would break the rework path above).
- Changing the Projects "issue closed → Done" workflow itself.

## Links

- Incident: issue #2753 timeline, PR #2924 (merge), PR #2925 (auto-done repair)
- Precedent incidents in the same pipeline: BUG-0220 (autolink), BUG-0307 (assignee 422)

- Done 2026-09-10: merged via #2926; first release containing it TBD by the next chore(release).
