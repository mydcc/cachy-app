---
id: FEAT-0816
title: Wire external market context as a veto feed
type: feature
status: specced
priority: P3
milestone: none
editions: [pro, private]
area: alerts
data_class: C
adr: required
depends_on: [FEAT-0814]
parent: FEAT-0805
size: L
estimate: 8
---

# FEAT-0816 — Wire external market context as a veto feed

## Problem

`external_feed` is legal only inside `veto` (ADR-0012 decision 7), but no feed
is wired: the `feeds` map in `EvaluationContext` is never populated by the
engine. So a trader cannot say "do not take this long while funding is
extremely positive" or "skip the setup when the fear-and-greed index is at an
extreme", even though the schema was designed for exactly that.

## Proposal

Implement the feed side of the existing contract, not a new trigger type:

- Three sources to start: funding rate, open interest change, and a
  fear-and-greed aggregate. Each is a named feed in `EvaluationContext.feeds`.
- Feeds are **only** evaluated in `veto`; the core already refuses them in
  `conditions`, and FEAT-0809 extends that refusal to `exits`.
- Freshness is explicit: a feed carries a timestamp and a maximum age; a stale
  feed never silently reads as a value. The stale policy is a decision (see
  Open questions).
- The veto sentence names the feed and the threshold; the suppression log says
  which feed refused and when it was last updated.
- A feed failure is visible ("veto unavailable"), once per rule, not a toast per
  candle.

Public market data only; no account data, no identity. Class C per ADR-0001.

## Acceptance criteria

- [ ] `EvaluationContext.feeds` is populated for the three sources on the
      evaluation path, with a timestamp per feed.
- [ ] `external_feed` is accepted in `veto` and refused in `conditions` and
      `exits` with a field-naming error.
- [ ] A stale feed follows the chosen policy and is logged; it never silently
      defaults to a value that looks fresh.
- [ ] A vetoed trigger records the feed, the value, the threshold and the feed
      timestamp.
- [ ] A feed outage produces one visible signal per rule, not one per candle.
- [ ] Feed values are `Decimal` strings at the boundary; no native-number
      comparison.
- [ ] Tests: fresh/stale, accept/refuse sites, suppression record, outage.

## Out of scope

- Feeds as triggers, exits or position sizing.
- Paid or account-specific data.
- A general feed plugin system; three sources first.
- Backtesting a feed whose history is not versioned (the ADR must say what is
  stored).

## Open questions

- Fail-open or fail-closed on a stale feed: proceed without the veto, or refuse
  the trigger. Proposal: fail-open **with a visible "veto unavailable"**, so an
  outage cannot silently freeze a strategy; the opposite is a risk decision.
- Which feed version is recorded for a backtest; an unversioned aggregate
  cannot be replayed honestly (ADR-0012).
- Whether this needs its own ADR for feed provenance, or an amendment to
  ADR-0012. Proposal: its own ADR, because "where did this number come from"
  outlives the rule schema.

## Links

- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`ADR-0001`](../../adr/0001-local-first-boundary.md)
- [`IDEA-0305`](../ideas/IDEA-0305-external-market-context-as-veto.md)
- [`FEAT-0814`](FEAT-0814-author-and-audit-veto-conditions.md)
