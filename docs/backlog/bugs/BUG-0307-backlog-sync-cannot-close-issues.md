---
id: BUG-0307
title: Backlog sync cannot converge issues when front-matter assignee is not an assignable collaborator
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
start_date: 2026-08-25
target_date: 2026-08-25
size: S
estimate: 2
---

# BUG-0307 — Backlog sync cannot converge issues when front-matter assignee is not an assignable collaborator

## Symptom

Issues #2171 (FEAT-0254) and #2179 (FEAT-0256) stayed **open** with stale
`status:*` labels for days after their work had fully landed on develop —
`RangeSlider.svelte` shipped, PR #2180 merged with `Fixes #2179`, and the
backlog markdown said `status: done`. GitHub and the backlog disagreed, and
nothing reported it.

## Root cause

Three defects stacked on top of each other:

1. **The convergence PATCH fails wholesale on one bad field.**
   `createOrUpdateIssue()` bundles `{ title, body, labels, state, assignees }`
   into a single PATCH. GitHub validates `assignees` against repository
   collaborators and rejects the *entire* request with HTTP 422 on one unknown
   value. Every item claiming `assignee: jules` / `opencode` / `antigravity` /
   `claude` / `human` (none of which are assignable collaborators) lost its
   `state: closed`, labels and title together — ≥19 items were stuck this way,
   including FEAT-0254/FEAT-0256. Run 32846763465:
   `[Sync] Failed to update issue FEAT-0256: ... "value":"jules","code":"invalid" ... "status":"422"`.
2. **The failure was swallowed.** The error path is `console.error` + continue;
   the workflow step exits 0, so every run showed green while markdown said
   done and issues stayed open.
3. **The auto-linker was dead.** `ensurePRsAreLinked()`'s PR-body PATCH never
   checked the response; `sync-backlog*.yml` grants no `pull-requests: write`,
   so run 32708108187 logged "Prepending the closing reference for #2171 to PR
   #2254" while nothing was actually written. Docs PRs (#2297, #2254) then
   merged with **no** closing keyword at all (`closingIssuesReferences: []`) —
   GitHub closed nothing. The PR-description lint only rejected *stray*
   references, not *missing* ones, so it waved those bodies through.

Timeline of both issues: implementation PR closes them via `Fixes #N` → the
sync reopens them seconds later (markdown still said `in-progress` — by
design) → the final convergence update dies on the 422 → drift forever.

## Fix

- `scripts/sync-github-issues.ts`: filter front-matter assignees against
  `/assignable/collaborators` before building any payload; apply assignees in
  a separate PATCH so they can never veto `state`/labels again; check the
  response of every previously fire-and-forget PATCH; collect failures and
  exit non-zero (with `::error::` annotations) when anything failed to
  converge — making the weekly `FORCE_FULL_SYNC` run the reconciliation audit.
- `sync-backlog.yml` / `sync-backlog-full.yml`: grant `pull-requests: write`
  so the auto-linker's PATCH actually lands.
- `lint-pr-body-refs.ts` + `pr-issue-match.ts`: require a closing reference on
  every PR description (explicit `[no issue]` marker as opt-out), closing the
  missing-reference half of the rule that let #2297/#2254 merge silently.
- Symptoms closed by hand: #2171 and #2179 commented, closed as completed and
  relabeled `status:done`.

## Acceptance criteria

- [ ] A front-matter `assignee` that is not a real collaborator produces a
      warning and is excluded from the payload; state, labels and title still
      converge in the same run.
- [ ] Assignee application can no longer prevent an issue from being closed or
      relabeled (separate PATCH after the core update).
- [ ] Any failed issue PATCH/POST, duplicate cleanup, or PR auto-link marks
      the sync run as failed (non-zero exit + annotation), instead of exiting
      green while items diverge.
- [ ] The assignable-collaborators lookup failing degrades to "no assignees
      set", never to "unvalidated assignees sent".
- [ ] Sync workflows carry `pull-requests: write`.
- [ ] A PR description without any closing reference fails `pr-body-lint`;
      `[no issue]` opts out explicitly; a marker does not launder stray
      references past the existing conflict check.
- [ ] Unit tests cover assignee sanitization (unknown/case/empty/none) and the
      presence check (missing, present, opted-out, marker-vs-strays).
- [ ] `npm run check`, targeted vitest runs, `npm run backlog:check` pass.

## Out of scope

- Rewriting front matter across all ~19 affected items to drop agent names —
  they stay in the markdown as provenance; only the API payload filters them.
- Kanban Projects v2 field mapping beyond what this fix touches.
- Commit-message reference linting (BUG-0220's territory, already covered).

## State

- Shipped in [PR #2303](https://github.com/mydcc/cachy-app/pull/2303) (commit 1003f107); issue-closing nit fixed alongside the item close.
