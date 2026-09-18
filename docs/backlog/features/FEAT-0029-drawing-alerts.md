---
id: FEAT-0029
title: Alerts on chart drawings
type: feature
status: done
assignee: claude
branch: feat/feat-0029-drawing-alerts
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0027, FEAT-0480]
start_date: 2026-08-01
target_date: 2027-03-15
size: S
estimate: 2
---


# FEAT-0029 — Alerts on chart drawings

## Problem

Traders mark support, resistance and channels on the chart. Those lines are
where the decisions are, and nothing watches them.

## Proposal

Alerts bound to drawing objects — horizontal lines, trend lines, channels — that
fire when price touches or crosses the drawing, including sloped lines whose
trigger level moves with time.

**Its prerequisite shipped first.**
[`FEAT-0480`](FEAT-0480-persistent-chart-drawings.md) built the persistent,
addressable drawing objects an alert hangs on. What this item owns is the
alert, not the drawing.

## Acceptance criteria

- [x] An alert on a horizontal line fires on crossing
- [x] An alert on a sloped line uses the level at the current time, tested at
      two different times
- [x] Moving a drawing moves its alert
- [x] Deleting a drawing disables its alert with a reason the panel shows, and
      deletes neither the rule nor its fired history
- [x] Definitions stay local

## Decision: what deleting a drawing does to its alert (2026-09-18)

The criterion above used to end in "removes or clearly orphans its alert —
decide which". Deciding it: **the rule is disabled and says why. It is not
deleted, and it does not keep firing.**

Deleting the rule throws away work the drawing never owned — a rule carries a
note, a validity period and a fired history — and a line is easy to remove by
accident. Leaving it armed on the drawing's last level is worse than either: it
would fire on a threshold that is no longer on the chart, the kind of
unverifiable trigger the rule system refuses everywhere else. Disabling keeps
the work, stops the firing, and leaves something the trader can re-anchor to a
new line.

## How it was built (2026-09-18)

**The binding is a ledger, not a field on the rule.** `cachy_rule_drawing_v1`
maps a rule id to the drawing it watches. The rule schema is owned by the Rust
core (`technicals-wasm/src/rule/`), which validates every document it is
handed, so an operand kind meaning "ask the chart" would have been a core
change and a wasm rebuild — for a binding that never affects how a comparison
is decided. `ruleOriginLedger.ts` (FEAT-0401) made the same call for the same
reason.

**The threshold is rewritten per evaluation, not stored.** A drawing-anchored
rule is an ordinary constant-threshold rule whose constant is replaced by
`levelAt(drawing, anchorMs)` before each evaluation. This is what makes
"moving a drawing moves its alert" need no code of its own — the level is read
fresh at every anchor, so the alert is never anchored to a number. It is safe
because `RuleEvaluationGate` dedupes on `document.id` and the core reads fired
history keyed the same way: the rewrite changes what the rule compares against
without touching what it *is*.

**A refusal is silence plus a reason.** A drawing-anchored rule whose drawing
is gone evaluates to nothing and reports through the loop's existing
`onUnevaluable` channel, which already dedupes per rule and already reaches the
panel. Falling back to the stored constant would fire on a level no longer on
the chart.

**Absence only counts when the store was readable.** `reconcileDrawingRules`
disables a rule whose drawing is missing, but only when `cachy_drawings_v1`
itself parsed — a fresh device or cleared site data would otherwise disarm
every drawing alert in one silent pass. Same gate, same reason, as FEAT-0387's
orphan pass.

**Crossing is direction plus frequency.** The comparison is chosen from where
price sits when the alert is armed (below the line arms `gte`, above arms
`lte`), and `frequency` is left absent, which the core reads as `once`.
Armed the other way it would hold the instant it was created.

## Links

- [`FEAT-0027`](FEAT-0027-alert-engine.md)
- [`FEAT-0480`](FEAT-0480-persistent-chart-drawings.md) — the drawing objects
  this waits on
- `src/lib/windows/implementations/CandleChartView.svelte`

## Scope boundary (added 2026-09-04)

[`FEAT-0395`](FEAT-0395-alert-entry-points.md) covers the chart right-click and
indicator-settings entry points for **price and indicator** alerts. This item owns
alerts anchored to a **drawing** — a trendline, a level, a channel — where the
threshold moves with the object. Both land in the panel from
[`FEAT-0389`](FEAT-0389-super-alert-panel.md).
