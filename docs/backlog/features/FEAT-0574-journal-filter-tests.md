---
id: FEAT-0574
title: Add test coverage for the journal date filter
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [BUG-0573]
---

# FEAT-0574 — Add test coverage for the journal date filter

## Summary
The journal date filter currently has no test coverage. The only component test under `journal/` covers table rendering, not filtering. Tests should be added to verify filtering correctness, including timezone handling (see BUG-0573).

## Motivation
To ensure the journal filter correctly filters trades by date, status, tags, and search query, and prevents regressions like the mixed UTC/local time bug.

## Scope
Add tests targeting the filtering logic in `JournalContent.svelte`.
