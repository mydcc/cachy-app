---
id: FEAT-0222
title: Apply low-risk major dependency updates (OpenAI, JSDOM, Undici)
type: feature
status: done
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
Client-initialization (`new OpenAI({ apiKey })`) and chat completion calls (`openai.chat.completions.create`) in `src/routes/api/sentiment/+server.ts` remain fully compatible in OpenAI SDK v7 without syntax changes.

## Acceptance criteria
- [x] `openai` updated to `^7.4.0`
- [x] `@types/jsdom` updated to `^30.0.0`
- [x] `undici` updated to `^8.10.0`
- [x] Sentiment API (`src/routes/api/sentiment/+server.ts`) successfully tested with the new OpenAI client version
- [x] `npm run check` passes without errors
- [x] `npm test` passes without errors

## Out of scope
- TypeScript 7 update (see FEAT-0224)
- SpacetimeDB 2.8.1 update (see FEAT-0223)

