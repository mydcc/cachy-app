---
id: FEAT-0816
title: Wire external market context as a veto feed
type: feature
status: done
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
assignee: claude
branch: feature/feat-0816-external-feed-veto
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

- [x] `EvaluationContext.feeds` is populated for the three sources on the
      evaluation path, with a timestamp per feed.
- [x] `external_feed` is accepted in `veto` and refused in `conditions` and
      `exits` with a field-naming error.
- [x] A stale feed follows the chosen policy and is logged; it never silently
      defaults to a value that looks fresh.
- [x] A vetoed trigger records the feed, the value, the threshold and the feed
      timestamp.
- [x] A feed outage produces one visible signal per rule, not one per candle.
- [x] Feed values are `Decimal` strings at the boundary; no native-number
      comparison.
- [x] Tests: fresh/stale, accept/refuse sites, suppression record, outage.

## Decisions

- **A stale or missing feed fails open, loudly.** The rule is evaluated without
  its veto for that candle and the trader gets one report per rule per outage.
  Chosen by the owner on 2026-11-20 over fail-closed, so that a third party
  cannot halt a strategy by going down. Recorded, with the price it costs, as
  [`ADR-0029`](../../adr/0029-an-external-feed-names-its-source-and-its-age.md)
  decision 3.
- **The whole veto is dropped, not the feed leaf.** A group whose feed leaf was
  removed means something its author never wrote (ADR-0029 decision 3).
- **The policy lives in the caller, not the core.** `evaluate` still answers an
  unreadable veto with `indeterminate`
  (`technicals-wasm/src/rule/evaluate.rs:345-357`); the engine removes the veto
  before it asks, so the core is never asked a question it cannot answer
  honestly, and no wasm change was needed (decision 4).
- **A backtest treats every feed as unavailable and must say so.** No history
  is stored and none is reconstructed, so a feed-vetoed backtest is an upper
  bound on signals (decision 8).
- **Its own ADR, not an amendment to ADR-0012.** "Where did this number come
  from" outlives the rule schema.
- **Each feed states its unit in the editor.** Funding is a fraction because
  that is how an exchange publishes it, the open-interest change is percent
  because that is what a trader types, fear and greed is an index 0..100. The
  leaf shows the unit instead of the old "no source delivers this feed yet"
  warning.
- **The funding fetcher is a port, not an import.** `readFundingRate` takes
  the venue adapter as an argument and `externalFeedStore.configure` takes it
  as a port, because `services/api/marketData` sits inside the app's import
  cycle and importing it would pull both feed modules in with it (the W1-02
  ratchet in `src/tests/architecture/cycle_ratchet.test.ts` fails on exactly
  that: 196 -> 198 files). The percent-to-fraction conversion stays with the
  adapter that owns it, so the port's type names a fraction and no copy of
  that arithmetic exists here.
- **Open interest is sampled, not fetched as a change.** Bitget publishes a
  level; the change is derived from samples at least 30 minutes and at most two
  hours apart, and the feed stays unavailable until that span exists -- which
  also means a fresh session has no open-interest veto for its first half hour.

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
- [`ADR-0029`](../../adr/0029-an-external-feed-names-its-source-and-its-age.md)
- Engine: `src/lib/rules/feedReadings.ts`,
  `src/services/alertEngine/externalFeed{Sources,Store}.ts`
- Proxies: `src/routes/api/{open-interest,fear-greed}/+server.ts`
