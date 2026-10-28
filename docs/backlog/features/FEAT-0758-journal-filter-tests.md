---
id: FEAT-0758
title: Add test coverage for the journal date filter
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [BUG-0757]
---

# FEAT-0758 — Add test coverage for the journal date filter

> **Renumbered (2026-10-28).** The file was removed by accident in #3680, together with
> the bug it covers (see BUG-0757). It was filed as `FEAT-0574`, a number another item
> has held since #3718, so the restored file is `FEAT-0758` and its dependency points at
> `BUG-0757`. Scope and motivation are unchanged.

## Summary
The journal date filter currently has no test coverage. The only component test under `journal/` covers table rendering, not filtering. Tests should be added to verify filtering correctness, including timezone handling (see BUG-0757).

## Motivation
To ensure the journal filter correctly filters trades by date, status, tags, and search query, and prevents regressions like the mixed UTC/local time bug.

## Scope
Add tests targeting the filtering logic in `JournalContent.svelte`.
