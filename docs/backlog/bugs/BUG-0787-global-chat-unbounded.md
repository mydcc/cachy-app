---
id: BUG-0787
title: Global Chat renders the whole 90-day SpacetimeDB subscription without a cap
type: bug
status: in-progress
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

A long-open tab with Global Chat enabled holds and renders every row the
SpacetimeDB subscription carries (retention 90 days). Each new message
re-sorts and re-renders the whole list — memory and INP risk.

## Evidence

Derived — `src/stores/chat.svelte.ts` (`applyRows`) and
`src/lib/windows/implementations/AssistantView.svelte` (renders
`chatState.messages` in full). Production audit PA-09.

## Fix

`applyRows` keeps only the newest `MAX_CHAT_MESSAGES` (200) after sorting.
Every consumer (assistant view, sidebar, chat window) therefore sees a bounded
list.

## Verification

New test in `src/stores/chat.test.ts`: 250 rows yield exactly the newest 200.
RED against `origin/develop` (`expected … 250 to have a length of 200`),
GREEN after.
