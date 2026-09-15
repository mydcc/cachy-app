---
inclusion: always
---

# Gortex workflow

Use Gortex MCP tools for indexed code. This is mandatory.

1. Start every coding task with `explore` using `operation: "task"` and the user's task text.
2. Use `search` for symbols, text, files, or AST shapes; use `read` for file, source, summary, or editing context.
3. Use `relations` for usages, callers, dependencies, dependents, and implementations; use `trace` for call chains and dataflow.
4. Before mutation, call `change` with `operation: "impact"`; for a signature change, also call operation `verify` with the proposed signature.
5. Mutate only with `edit` or `refactor`. After mutation, call `change` operations `detect`, `tests`, `guards`, and `contract`.
6. Call `capabilities` with `domain`, `operation`, and `detail: "schema"` when exact arguments are not already visible.

Do not replace graph reads or searches with shell commands. If the configured Gortex tools are missing from the callable MCP tools, report a Gortex MCP integration failure and stop; do not start a daemon or use a CLI/shell fallback.

For durable context, use `recall` (`surface`/`notes`/`memories`) before editing known code and `remember` (`note`/`memory`) for decisions and invariants.
