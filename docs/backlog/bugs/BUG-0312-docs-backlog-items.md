---
id: BUG-0312
type: bug
title: "Stale code references in done backlog items"
status: done
priority: P2
area: docs
created: "2026-08-25"
assignee: opencode
milestone: none
editions: ["community"]
data_class: none
adr: none
depends_on: []
---

# Fix stale backlog item references

## Background
Some features in `done` state contain stale code references:
- FEAT-0195: mentions `telemetry.ts` instead of `telemetry.svelte.ts` and non-existent `getOrCreateSymbol`/`releaseSymbolBackingBuffers`.
- FEAT-0259: mentions incorrect paths for locale files.

## Solution
Update the items to reflect reality.
