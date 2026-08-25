---
id: BUG-0310
type: bug
title: "bitunix-api INTEGRATION_STATUS is stale"
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

# Fix bitunix-api INTEGRATION_STATUS

## Background
INTEGRATION_STATUS.md claims `get_leverage_margin_mode` and `get_position_tiers` are not implemented, but the proxy routes exist.

## Solution
Mark them as implemented.
