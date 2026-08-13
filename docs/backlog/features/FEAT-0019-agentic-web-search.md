---
id: FEAT-0019
title: Let the assistant research the web when it needs to
type: feature
status: idea
priority: P2
milestone: M8
editions: [pro, private]
area: ai
data_class: C
adr: none
depends_on: [FEAT-0016]
---

# FEAT-0019 — Let the assistant research the web when it needs to

## Problem

The AI assistant answers from context gathered before the request. It cannot
find out why an asset just moved, because the answer is in a news item nobody
fetched.

## Proposal

An agentic loop: the model may emit a search tool call, the client executes it
through a proxy route, results are injected and the model answers with sources
cited.

Two prior plans exist and were never built —
`docs/archive/dexter_integration_plan.md` and
`docs/archive/web_search_implementation_plan.md`. They are prior art, not a
specification: they were written against a different AI stack, and there is no
`searchService.ts` and no Tavily or Exa reference anywhere in `src/`. Re-specify
against the current stack rather than resurrecting them.

Search results and derived analysis are **Class C** under
[ADR-0004](../../adr/0004-spacetimedb-data-scope.md) §2 — cacheable, but never
stored next to a user identity. What a user asked about is user data.

## Acceptance criteria

- [ ] The assistant answers a "why did X move today" question using data it
      fetched during the request
- [ ] Sources are cited and link out
- [ ] The loop is bounded — a stated maximum number of tool calls per request
- [ ] The API key is server-side only and never reaches the client bundle
- [ ] No cached search row carries a user or connection identity
- [ ] Failure of the search provider degrades to a normal answer, not an error

## Open questions

- Which provider, and what it costs per query. This is a per-user marginal cost,
  which is why the item is `pro`/`private` rather than `community`.
- Whether the loop runs client-side (as the archived plans proposed) or in a
  route. Client-side means the key cannot be server-side; those two constraints
  conflict and one has to give.

## Links

- `docs/archive/dexter_integration_plan.md`, `docs/archive/web_search_implementation_plan.md`
- `src/stores/ai.svelte.ts`, `src/routes/api/ai/`
