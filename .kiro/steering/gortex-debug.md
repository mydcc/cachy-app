---
inclusion: manual
---

# Debug with Gortex

1. Localize the symptom with `explore`.
2. Use `search` with `operation:"text"` for an exact error and `operation:"symbols"` for named code.
3. Use `relations({operation:"callers", ...})` and `trace({operation:"call_chain", ...})` to follow execution.
4. Use `trace` with `flow` or `taint` when the bug concerns values crossing helpers.
5. Read only the suspect symbols, then state the root cause and evidence.
