---
id: BUG-0557
title: Clearing max-open-positions converts an absent limit into zero
type: bug
status: done
assignee: opencode
branch: fix/0557-max-open-positions
priority: P1
milestone: none
editions: [community, pro, private]
area: settings
data_class: A
adr: none
depends_on: []
---

# BUG-0557 — Clearing max-open-positions converts an absent limit into zero

## Symptom

Deleting the Max Open Positions value to disable the limit stores zero. The gate then interprets the setting as a configured limit of zero and blocks all new entries instead of removing the ceiling.

## Evidence

**Derived.** `src/components/settings/RiskLimitsSettings.svelte:102-105` converts input with `Number(value)`, and JavaScript converts the empty string to zero. The field’s “not configured” placeholder at `:283-292` indicates that empty should mean absent. The persisted zero is later consumed as a real limit by the execution gate.

## Cause

The settings input conflates empty, invalid, and explicit numeric states, and converts them through a permissive number parser.

## Fix

Parse empty as null/unconfigured, require a positive integer for a configured ceiling, and preserve any intentional explicit-zero semantics as a separately confirmed state if the product supports it.

## Acceptance criteria

- [x] Clearing the field stores no limit and leaves position-count gating unconfigured.
- [x] Positive integers round-trip unchanged.
- [x] Fractions, negatives, and non-numeric input are rejected inline without changing the prior limit.
- [x] Explicit zero has separately specified semantics and a regression test.
- [x] Persistence and reload preserve unconfigured and explicit-zero states distinctly.

## Out of scope

- Kill-switch behavior covered by FEAT-0526.
- Other risk-limit fields unless they share the same parser and are proven affected.

## Links

- `src/components/settings/RiskLimitsSettings.svelte:102-105`
- `src/components/settings/RiskLimitsSettings.svelte:283-292`
- Existing coverage: FEAT-0526; no existing item records empty max-open-positions parsing.
