---
id: BUG-0308
type: bug
title: "calculation-engine docs list non-existent features"
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

# Fix calculation-engine docs

## Background
The documentation for the calculation engine claims features like Circuit Breaker, Adaptive Learning, and Context Awareness. These do not exist in the code.

## Solution
Document the current state (static thresholds) and move the visionary features to a clearly marked "Planned" section.
