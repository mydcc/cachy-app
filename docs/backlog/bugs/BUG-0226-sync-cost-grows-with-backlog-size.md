---
id: BUG-0226
title: Backlog sync cost grows with total backlog size instead of what actually changed
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
---

# BUG-0226 — Backlog sync cost grows with total backlog size instead of what actually changed

## Symptom

Every push to `develop`/`main` touching `docs/backlog/**/*.md` re-walks the
**entire** backlog in `scripts/sync-github-issues.ts` — one REST PATCH plus a
Kanban GraphQL round trip per item, plus a fixed 300ms throttle sleep — even
when the push changed one item's status field. 74 of 118 items (63%) are
already `done` and never change again; that share only grows. The run gets
slower with every merge regardless of how small the actual diff was.

## Evidence

**Demonstrated** — observed directly while watching `sync-backlog.yml` runs
during this session: a dispatched run against 118 items sat in the "Run Sync
Script" step for several minutes. The per-item sleep alone
(`117 × 300ms ≈ 35s`) is a floor, not the whole cost — each item also does at
least one PATCH and, via `syncProjectKanbanStatus`, a GraphQL query plus up to
several mutations against the Projects v2 API.

## Cause

`createOrUpdateIssue()` has no notion of "nothing changed" — it unconditionally
PATCHes and re-syncs the Kanban status for every local item on every run,
whether or not the resulting GitHub state would differ from what's already
there.

## Fix

`createOrUpdateIssue()` now skips the PATCH and the Kanban sync entirely for
an item when all of the following hold, using data already in memory from the
single bulk `fetchAllIssues()` call (no extra request needed to decide):

- the item's status is `done`/`dropped` (closed, not mid-transition)
- it has no open PR (`hasOpenPR` false — `in-review` is transient, not meant
  to be skipped)
- the existing issue is already closed, and its title, body, milestone and
  label set already match exactly what this run would write

A new weekly workflow, `sync-backlog-full.yml`, runs the same script with
`FORCE_FULL_SYNC=true`, which bypasses the skip unconditionally. This is the
safety net for drift the skip can't see by construction — a board column or
label edited directly on GitHub, outside a backlog-file change — without
paying that cost on every push.

## Acceptance criteria

- [x] `createOrUpdateIssue` skips the PATCH and `syncProjectKanbanStatus` call
      for a closed item whose title/body/milestone/labels already match
- [x] The skip does not apply when `hasOpenPR` is true, or when
      `FORCE_FULL_SYNC=true`
- [x] `sync-backlog-full.yml` runs weekly (Monday 05:00 UTC) and on
      `workflow_dispatch`, targeting `develop` explicitly, sharing the same
      `concurrency` group as `sync-backlog.yml` so the two never race
- [x] Live verification: push-triggered run after merge shows skipped items
      and completes noticeably faster than pre-fix baseline (PR #2032)
- [x] Live verification: weekly full-resync runs successfully with
      `FORCE_FULL_SYNC=true` and processes every item

## Out of scope

- Caching or batching the GitHub API calls themselves (e.g. GraphQL bulk
  mutations) — the skip removes most of the calls outright, which is enough
  for now; revisit only if the full-resync path itself becomes slow.
- Persisting a "last synced" hash/timestamp per item. The in-memory
  comparison against the one bulk fetch is simpler and can't go stale between
  runs the way a stored value could.

## Links

- `scripts/sync-github-issues.ts` — `createOrUpdateIssue`, `sameLabelSet`,
  `FORCE_FULL_SYNC`
- `.github/workflows/sync-backlog.yml`, `.github/workflows/sync-backlog-full.yml`
- [`BUG-0225`](BUG-0225-index-regeneration-merge-conflicts.md) — same session,
  same file, the sibling fix this one follows
