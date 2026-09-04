---
id: FEAT-0390
title: Price alert conditions beyond a single target
type: feature
status: specced
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0389]
size: S
estimate: 3
---

# FEAT-0390 — Price alert conditions beyond a single target

## Problem

The only price alert Cachy can express is "price reached X". A trader watching a
breakout wants "rises above", a trader watching a stop wants "falls below", and a
trader watching volatility wants "moves 5% either way" — three different questions
that all collapse into one ambiguous threshold today.

## Proposal

Four condition types in the Price tab, plus a price source:

| Type | Maps to |
|---|---|
| Rises above | `Condition::Cross { direction: above }` |
| Falls below | `Condition::Cross { direction: below }` |
| Rise reaches *n*% | `Condition::Compare` against a percentage move |
| Fall reaches *n*% | `Condition::Compare` against a percentage move |

Price source: last price or mark price. On a perpetual these differ, and a stop that
should key off the mark price but keys off the last is a wrong alarm at the worst
moment.

No new Rust: every one of these is an existing `Condition` variant. Percentage moves
are `Decimal` throughout — no floats, per the non-negotiable rule in `AGENTS.md`.

## Acceptance criteria

- [ ] All four types arm and fire correctly against recorded historical data
- [ ] "Rises above" does not fire when the price was already above at arming time —
      it is a crossing, not a comparison
- [ ] Last price and mark price are selectable and the choice is visible on the armed rule
- [ ] Percentage moves are measured from a reference point stated on the rule, not from
      an implicit one
- [ ] Percentages and prices go through `decimal.js` / `Decimal` with no float step
- [ ] German and English strings

## Out of scope

- The slider preset UI. Nice, not load-bearing; add it after the conditions are right.

## Open questions

- **What is the reference point for a percentage move?** The price at arming, the
  previous close, or the session open. All three are defensible and they are different
  alarms — pick one, name it on the rule, and say so in the sentence.

## Links

- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the panel this tab lands in
- [`FEAT-0027`](FEAT-0027-alert-engine.md) — the price alerts that ship today
- `technicals-wasm/src/rule/condition.rs`
