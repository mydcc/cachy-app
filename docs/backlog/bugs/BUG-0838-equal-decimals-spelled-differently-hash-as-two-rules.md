---
id: BUG-0838
title: Equal decimals spelled differently hash as two rules
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# BUG-0838 — Equal decimals spelled differently hash as two rules

## Symptom

Two rule documents that differ only in how a number is written, such as a
constant `50000` against `50000.0` or a stop distance `2` against `2.00`,
get two content hashes. The hash is the strategy's identity in the journal,
so the same strategy can show up as two strategies, and a re-saved rule can
lose the match to its own history.

## Evidence

**Derived**, not demonstrated for rules.

- `rust_decimal` with the `serde-with-str` feature keeps the scale it was
  given. FEAT-0819's grid test
  (`technicals-wasm/src/rule/grid.rs`,
  `an_equal_decimal_spelled_differently_keeps_the_hash`) failed for exactly
  this reason before the grid parser normalised its prices and budget.
- No call to `normalize()` exists anywhere in `technicals-wasm/src/rule/`, so
  `RuleDocument`'s decimals (condition constants, stop and take-profit
  distances, limits) reach `canonical_json` with their authored scale.

Whether a stored rule with a non-canonical spelling exists is unknown. The
app's own editors may already emit one spelling consistently.

## Cause

`canonical_json` sorts keys and strips whitespace, but treats a decimal's
scale as part of its value.

## Fix direction

Write the failing Rust test first: two rules that differ only in a
constant's scale must share a hash. Normalising at parse time moves the
hash of every stored rule whose decimals carry trailing zeros, so first
establish whether such rules can exist (what the editors and the AI authoring
path emit), then decide between normalising with a migration note and
accepting the moved identities. Changing what is hashed rewrites history once
a rule is live (see `EXCLUDED_FROM_HASH` in `document.rs`).

## Links

- [`FEAT-0819`](../features/FEAT-0819-grid-bot-runtime-on-the-paper-account.md) — where the gap surfaced; the grid normalises from its first version.
