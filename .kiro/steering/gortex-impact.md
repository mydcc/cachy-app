---
inclusion: manual
---

# Assess change impact with Gortex

1. Resolve the target with `explore` or `search`.
2. Call `change` with `operation:"impact"`.
3. For signature changes, call `change` with `operation:"verify"`.
4. Check `relations` usages/dependents and `analyze` contracts when boundaries are involved.
5. Call `change` with `operation:"tests"` and report concrete tests.
