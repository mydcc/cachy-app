---
id: BUG-0467
title: A stored rule the core refuses is logged on every close and never reported
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: none
adr: none
depends_on: []
assignee: claude-code
branch: fix/bug-0467-refused-rule-silent
start_date: 2026-09-13
---

# BUG-0467 — A stored rule the core refuses is logged on every close and never reported

## Symptom

The core validates every document it evaluates (`parse_document` in
`technicals-wasm/src/rule/document.rs`), not only at arming. A rule armed under one core
and refused by a later, stricter one:

- threw `RuleRefusedError` on every close of its series
- was caught per rule in `RuleEvaluationLoop.evaluateSeries` (BUG-0449) and logged as a
  failed evaluation, each close
- was retried on every tick by `ruleEvaluationGate`, which treats a refusal as transient
- was **never reported** through `onUnevaluable`, so "Alerts that can never fire" did not
  list it and the trader was not told

To the trader it looked like an armed alert that had simply not fired yet. It never
would.

## Evidence

**Demonstrated** with a test. **Latent in production today**: the core has not tightened
under a stored rule yet. Found while planning FEAT-0446 group 4. The decided OBV shape
makes the core refuse OBV against a fixed number, and such alerts could be armed before
BUG-0451 hid OBV. Those currently report as unevaluable because the alert path does not
compute OBV. The moment OBV is computed, they would reach the core, be refused, and go
silent.

`technicals-wasm/src/rule/condition.rs` (`check_dimensions`) already names the hazard: "a
saved alert that stops validating is a worse failure than the one being prevented".
Nothing on the evaluation side made that failure visible.

## Fix

`RuleEvaluationLoop.evaluateSeries` tells a refusal apart from other failures:

- A `RuleRefusedError` is reported once through `reportUnevaluable`, with the refusal as
  its reason, and is not logged again on each close.
- Every other throw is still logged and not reported. A reader failing once does not
  justify "can never fire".

Refusal is deterministic: the same document against the same core is refused every time.
That is what makes it an unevaluable rule rather than a transient failure.

## Tests

`src/services/alertEngine/ruleEvaluationLoop.test.ts` › *reports a rule the core refuses
as unevaluable, once, and evaluates the rules after it*:

- over two closes, the refused rule is reported exactly once, by id, name and symbol, with
  the refusal code in the reason
- the rule after it fires both times
- no failed-evaluation log line names it

RED before the fix: the sink was called 0 times.
