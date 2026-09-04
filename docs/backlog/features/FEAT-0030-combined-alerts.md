---
id: FEAT-0030
title: Combine several conditions into one alert
type: feature
status: idea
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0028, FEAT-0303, FEAT-0387, FEAT-0389]
start_date: 2026-08-01
target_date: 2027-03-15
size: S
estimate: 2
---


# FEAT-0030 — Combine several conditions into one alert

## Problem

Real setups are conjunctions: RSI oversold *and* price at support *and* volume
above average. Separate alerts for each produce noise, not a signal.

## Proposal

Several conditions joined with AND/OR, a validity window, and a note. The UI
challenge is bigger than the engine: a condition builder that a trader can read
back and trust is what makes this useful, and a builder that produces
unintelligible logic is worse than three separate alerts.

## Acceptance criteria

- [ ] Conditions combine with AND and OR, and the resulting logic is displayed
      in plain language in both locales
- [ ] A validity window expires the alert without firing
- [ ] A combined alert fires exactly once when all conditions hold
- [ ] Conditions that hold at different times do not fire unless the
      simultaneity rule stated in this item says they should
- [ ] The evaluation cost stays bounded with many alerts armed

## Answered while planning the Super-Alert work (2026-09-04)

**What simultaneity means** is settled by the rule core
([`FEAT-0303`](FEAT-0303-strategy-rule-schema.md)): every condition is evaluated at the
same instant — the close of the rule's `trigger_timeframe` — and each reads the last
candle of *its own* timeframe that had already closed at that instant. So "all true in
the same evaluation" is the answer, and multi-timeframe combinations still work because
a coarser condition holds across several finer triggers.

A condition may not name a timeframe finer than the trigger; the validator refuses that
by name rather than guessing.

Two consequences for this item:

- The AND/OR tree is `Condition::Group { op: all | any | none }` — already built,
  already depth-bounded (`MAX_CONDITION_DEPTH`), already refusing empty groups.
- The item's real work is the **builder and the read-back**, exactly as its Proposal
  says. The plain-language sentence is owned by
  [`FEAT-0389`](FEAT-0389-super-alert-panel.md); this item makes sure a combination
  renders into it correctly.

Limit: five conditions per rule.

## Links

- [`FEAT-0303`](FEAT-0303-strategy-rule-schema.md) — the condition tree and its bounds
- [`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md) — the evaluator
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the Combo tab and the read-back sentence
- [`FEAT-0028`](FEAT-0028-indicator-alerts.md)
- Reference behaviour: Bitunix "Super Alert" Combo tab (described, not reproduced)
