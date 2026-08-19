---
inclusion: manual
---

# Refactor with Gortex

1. Start with `explore` and read the target through `read`.
2. Call `change` operations `impact` and `edit_plan` before writing; for a signature change, also call `verify` with the proposed signature.
3. Use `refactor` for rename, move, inline, delete, or code actions. Use `edit` for file, symbol, batch, or new-file changes.
4. After writing, call `change` operations `detect`, `tests`, `guards`, and `contract`.
5. Run the project tests selected by the graph.
