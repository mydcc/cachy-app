---
id: BUG-0309
type: bug
title: "ADR violations in code vs docs"
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

# Fix ADR conflicts

## Background
There are conflicts between ADRs (0004, 0006, 0009) and actual code implementations (e.g. `cloudHost` default, FlashCard stacking, telemetry).

## Solution
Add pragmatic amendments to ADRs 0004, 0006, and 0009 to legalize the current code behavior as exceptions.
