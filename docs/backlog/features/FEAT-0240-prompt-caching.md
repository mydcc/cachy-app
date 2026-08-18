---
id: FEAT-0240
title: Implement Prompt Caching for baseRoleInstructions
type: feature
status: idea
priority: P2
milestone: none
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
parent: FEAT-0239
---

# FEAT-0240 — Implement Prompt Caching for baseRoleInstructions

## Problem
The `baseRoleInstructions` block is extremely long (>100 lines) and is sent completely with every message alongside the real-time context. This drives up token consumption and costs per request unnecessarily.

## Proposal
Implement caching mechanisms (e.g., Anthropic Prompt Caching) or extract static instructions so they do not need to be repeatedly sent in full.

## Acceptance criteria
- [ ] Base role instructions are cached or optimally structured to reduce token overhead.

## Out of scope
- Changing the content of the instructions.

## Open questions
- Which provider caching mechanism is best supported across our models?
