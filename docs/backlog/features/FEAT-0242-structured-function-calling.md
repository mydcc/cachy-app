---
id: FEAT-0242
title: Replace regex-based JSON parsing with structured Function Calling
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

# FEAT-0242 — Replace regex-based JSON parsing with structured Function Calling

## Problem
Action outputs rely on markdown codeblock patterns removed via regex. Models returning slightly different formats break parsing.

## Proposal
Use structured Function Calling / Tool Use formats where supported by providers for more robust parsing.

## Acceptance criteria
- [ ] Action JSON parsing is robust and uses provider-supported structured outputs where available.

## Out of scope
- Supporting providers that do not have structured outputs.

## Open questions
- Fallback mechanism for models without tool use?
