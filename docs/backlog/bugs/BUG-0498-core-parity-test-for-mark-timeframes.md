---
id: BUG-0498
title: No parity test pins the TS mark-timeframe mirror to the core export
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# BUG-0482 follow-up — No parity test pins the TS mark-timeframe mirror to the core export

## Symptom

`collectMarkTimeframes` in `src/services/alertEngine/ruleEvaluationLoop.ts` is
documented as "the local mirror of `RuleDocument::mark_timeframes` in the core"
with the warning "the two must agree" — but nothing tests that they do. BUG-0482
proved the two disagreed on `window`-nested operands: the rule looked armed and
could never fire. The recursion fixed today's shape; the next operand that nests
another reopens the same silent failure, and nothing will catch it.

## Evidence

**Derived.** Two pieces of code answer the same question independently:

- TS: `collectMarkTimeframes` walks conditions (`conditions`, `veto`) and operands
  (`left`, `right`, `of`, group children).
- Core: `Condition::mark_timeframes` in `technicals-wasm/src/rule/condition.rs`
  delegates to its operands; `technicals-wasm/src/rule/exports.rs` exports
  `rule_mark_timeframes` for exactly this question.

`ruleSchema` exposes no binding for that export today, so a test cannot ask both
sides yet. `crossPathParity.test.ts` compares indicator values, not timeframe sets.

## Cause

The mirror was written by hand against the core instead of tested against it.

## Fix

Expose `rule_mark_timeframes` through `ruleSchema` (wasm surface, rebuild), then
add the parity test BUG-0482's Fix section already specifies: for a corpus of
documents covering every condition and operand shape in `src/lib/rules/types.ts`,
`collectMarkTimeframes` must return the same set as the core export.

Leave alone: core evaluation semantics and the BUG-0482 recursion itself (shipped
in #3480). This item is the test harness, not another fix.

## Acceptance criteria

- [ ] `ruleSchema` exposes a binding for the core's `rule_mark_timeframes`
- [ ] A parity test asserts `collectMarkTimeframes` equals the core export over
      every condition and operand shape in `types.ts`
- [ ] The test fails if either side is deliberately broken (verified by breaking
      one side and re-running)

## Out of scope

- Changing what the core answers — only that both sides agree
- Re-fixing BUG-0482 (done in #3480)

## Links

- `BUG-0482` (`docs/backlog/bugs/BUG-0482-mark-price-in-a-window-operand-is-invisible.md`) — the incident that motivated this; its AC2 deferred here
- `src/services/alertEngine/ruleEvaluationLoop.ts` — `collectMarkTimeframes`
- `technicals-wasm/src/rule/exports.rs` — `rule_mark_timeframes`
- PR #3480 — discussion of why the binding is a separate change
