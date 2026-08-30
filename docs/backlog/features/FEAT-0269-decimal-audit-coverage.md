---
id: FEAT-0269
title: Extend the decimal.js CI audit beyond its three hardcoded files
type: feature
status: done
assignee: antigravity
priority: P3
milestone: none
editions: [community, pro, private]
area: tooling
data_class: none
adr: none
depends_on: []
branch: feat/0269-decimal-audit-coverage
---

# FEAT-0269 — Extend the decimal.js CI audit beyond its three hardcoded files

## Problem

`.github/workflows/audit.yml` greps only `tradeService.ts`, `apiService.ts` and
`calculator.ts` for native-number financial math. Newer financial code
(`orderPlacementService`, `syncService`, `bitgetWs`, the tpsl store) is outside
automated enforcement — manually spot-checked clean in the 2026-08-23 audit, but
unprotected against regressions.

## Proposal

Either extend the file list to every financial path, or invert the check into a
lint rule that forbids native arithmetic on price/qty/amount-typed fields
(preferable — a list rots again). Keep the existing grep as a belt-and-braces
stage if cheap.

## Acceptance criteria

- [x] Introducing native `+`/`*` on a price field in a currently-uncovered file
      fails CI — proven by adding one in the PR and reverting it
- [x] No false positives block unrelated numeric code (timers, indices)
- [x] The audit runs on every push, not only on schedule/dispatch

## Out of scope

Migrating any code — everything audited was already clean. Rust/WASM side
(covered by [`BUG-0182`](../bugs/BUG-0182-epic-decimal-migration-rust.md)).

## Links

- `.github/workflows/audit.yml`
- `scripts/audit-decimal.mjs` (new dynamic scanner)
- Security audit 2026-08-23, finding "decimal.js CI grep covers only 3 files" (Info)
