---
id: FEAT-0391
title: A template library for alert rules
type: feature
status: specced
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0028, FEAT-0030, FEAT-0389]
size: M
estimate: 5
---

# FEAT-0391 — A template library for alert rules

## Problem

A condition builder powerful enough to be useful is powerful enough to face a new user
with an empty form and no idea what to put in it. The gap between "I want to catch a
trend reversal" and a valid multi-condition rule is where most people stop.

## Proposal

A Templates tab: named strategies, each a complete `RuleDocument`, grouped by category
(Classic · Trend · Reversal · Range · Breakout · Risk). Each card shows the name, a
one-line description, and the indicators it uses. Picking one loads it into the Combo
tab **for editing** — it is a starting point, not a black box.

Starting set, one per category shape:

- MACD golden cross while RSI is oversold
- MACD death cross while RSI is overbought
- 50/200 golden cross confirmed by volume
- Vegas tunnel trend continuation
- TEMA cross above VWAP

Templates are **data**, not code: each is a `RuleDocument` that goes through the same
`validate()` as a hand-built rule, and the same content hash. That hash is the useful
part — it makes visible whether a trader is running a template unchanged or a variant
of it, which is what makes the register in `FEAT-0304` able to say anything.

Every template ships at `consequence_level: notify` and
`provenance.source: human`. A template that arrives armed to trade is not a template.

## Acceptance criteria

- [ ] Every shipped template passes `validate()` — asserted by a test that iterates the
      whole library, so a broken template cannot ship
- [ ] Loading a template fills the Combo builder and the rule can be edited before arming
- [ ] An unedited template and a second trader's unedited copy of it have the same
      content hash
- [ ] No shipped template has a `consequence_level` above `notify`
- [ ] Categories filter the list
- [ ] German and English names and descriptions for every template

## Out of scope

- User-saved and shared templates. Sharing a template is a Class B question and needs
  its own ADR.
- Backtest results shown on the card. Wanted, but it needs a backtest path first.

## Links

- [`FEAT-0304`](FEAT-0304-model-proposes-rules.md) — the register that reads these hashes
- [`FEAT-0030`](FEAT-0030-combined-alerts.md) — the builder templates load into
- Reference behaviour: Bitunix "Super Alert" Templates tab (described, not reproduced)
