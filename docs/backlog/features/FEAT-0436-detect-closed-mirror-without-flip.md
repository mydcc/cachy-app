---
id: FEAT-0436
title: Detect backlog mirror issues that closed without the item being marked done
type: feature
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: ci
data_class: none
adr: none
depends_on: []
---

# FEAT-0436 — Detect backlog mirror issues that closed without the item being marked done

## Problem

If a PR closes a backlog mirror issue without flipping the item — through a
flake, a bypass, or a manual close — nothing notices. The post-merge auto-done
bot was removed on purpose, and no read-only detector replaced it, so the drift
is silent: the issue is closed while `INDEX.md` still lists the item as open.

## Proposal

A scheduled, read-only reconciliation job that lists backlog mirror issues
which are closed while their item's `status` is not terminal, and surfaces them
(e.g. reopens the issue, or opens a single tracking issue). It never mutates
backlog files, so it cannot re-introduce the post-merge bot's unreviewed flips.

## Acceptance criteria

- [ ] A scheduled workflow lists closed mirror issues whose item is not `done`/`dropped`
- [ ] Findings are surfaced without changing any backlog file
- [ ] The job is read-only and idempotent (repeat runs produce no duplicate noise)
- [ ] A dry-run mode exists for review before enabling notifications

## Out of scope

- Auto-flipping backlog items — removed on purpose (see BUG-0431).
- Mutating issues or backlog files without a human/agent decision.

## Open questions

- Surface a finding by reopening the issue, by opening a tracking issue, or by
  failing a scheduled check? Needs a decision before this is `ready`.

## Links

- [ADR-0017](../../adr/0017-required-ci-gates-fail-closed-after-bounded-retry.md)
- BUG-0431, `.github/workflows/sync-backlog.yml`
