---
inclusion: manual
---

# Explore with Gortex

1. Call `explore({operation:"task", task:"<question>"})`.
2. Narrow names with `search({operation:"symbols", query:"<name>"})` or literals with `operation:"text"`.
3. Read only the needed source with `read` (`source`/`summary`/`editing_context`).
4. Prove relationships with `relations` or execution paths with `trace`.
5. Return symbol IDs, file:line locations, and the shortest evidence needed.
