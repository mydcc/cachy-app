---
id: FEAT-0222
title: Apply low-risk major dependency updates (OpenAI, JSDOM, Undici)
type: feature
status: specced
priority: P2
milestone: M0
editions: [community, pro, private]
area: tooling
data_class: none
adr: none
depends_on: []
---

# FEAT-0222 — Apply low-risk major dependency updates (OpenAI, JSDOM, Undici)

## Problem
Jules skipped several major dependency updates during the weekly chore (#2016). To minimize risk and allow agents to work sequentially, the updates have been split. This item covers the low-risk packages.

## Proposal
Manually update and test the major versions for `openai`, `@types/jsdom`, and `undici`.

## Acceptance criteria
- [ ] `openai` updated to `^7.4.0`
- [ ] `@types/jsdom` updated to `^30.0.0`
- [ ] `undici` updated to `^8.10.0`
- [ ] Sentiment API (`src/routes/api/sentiment/+server.ts`) successfully tested with the new OpenAI client version
- [ ] `npm run check` passes without errors
- [ ] `npm test` passes without errors

## Out of scope
- TypeScript 7 update (see FEAT-0224)
- SpacetimeDB 2.8.1 update (see FEAT-0223)

## Open questions
- Hat sich die Syntax der Client-Initialisierung für `openai` in v7 geändert?
