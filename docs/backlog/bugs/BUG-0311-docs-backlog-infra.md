---
id: BUG-0311
type: bug
title: "Backlog infra docs and generated index are out of sync"
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

# Fix backlog infra metadata

## Background
`README.md` is missing valid metadata fields (`branch`, `done_version`, `shipped`, `iteration`). 
The `INDEX.md` and `.generated.*` files are out of sync with item files.

## Solution
Update README tables and run `npm run backlog:index`.
