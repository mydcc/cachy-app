---
id: FEAT-0245
title: Centralize prompt templating and versioning
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

# FEAT-0245 — Centralize prompt templating and versioning

## Problem
The entire prompt is built as an inline template string in `sendMessage`. There is no versioning or testing for prompt regressions, making changes hard to test or A/B test.

## Proposal
Extract prompts into separate files and add snapshot tests.

## Acceptance criteria
- [ ] Prompts are extracted to separate template files.
- [ ] Snapshot tests exist for prompt generation.

## Out of scope
- A/B testing infrastructure.

## Open questions
- None.
