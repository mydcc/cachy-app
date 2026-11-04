---
id: BUG-0787
title: Global Chat renders the whole 90-day SpacetimeDB subscription without a cap
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: chat
data_class: B
adr: ADR-0001
depends_on: []
assignee: opencode
branch: fix/chat-cap-ws-reconnect
---

# BUG-0787 — Global Chat renders the full subscription (PA-09)

## Symptom

A long-open tab with Global Chat enabled holds and renders every row the module
retains (90 days, `docs/GLOBAL-CHAT.md` §4). Each new message re-projects and
re-renders the whole list — memory and INP risk.

## Evidence

Derived when filed; demonstrated by the test in `src/stores/chat.test.ts`
(`keeps only the newest window …`), which is red against the unfixed
`applyRows` (`expected … 250 to have a length of 200`).

## Cause

`applyRows` received the cumulative row list from `cloudService` and assigned
the mapped/sorted result to `chatState.messages` without a bound. Every
consumer then rendered the full array.

## Fix

`applyRows` sorts the raw rows, keeps the newest `MAX_CHAT_MESSAGES` (200) and
only then projects them into `ChatMessage`. Sorting before the cut is what makes
it mean "newest" rather than "last delivered".

The chat export prepends a line stating that only the most recent messages are
included, so a truncated transcript is not mistaken for the whole record.

## Acceptance criteria

- [x] `applyRows` yields at most 200 messages, proven by a test that delivers
      the rows out of order and fails if the slice runs before the sort
- [x] The cut keeps the newest rows and drops the oldest
- [x] The export says it is a recent-messages excerpt

## Out of scope

- `cloudService.messages` still grows unbounded and `applyRows` still sorts the
  full incoming list, so the per-insert cost remains O(n log n). PA-09's
  "re-sorts the whole list" half is therefore only fixed on the render side.
  Bounding the accumulation belongs in `cloudService` (ring buffer + O(1)
  dedupe) and needs its own item.
- No "load older" affordance: the cap drops history the user cannot reach.

## Links

- `src/stores/chat.svelte.ts` (`applyRows`)
- `src/services/cloudService.ts` (`onInsert`, still unbounded)
- `docs/GLOBAL-CHAT.md` §4 (retention)
- ADR-0001 / ADR-0004
