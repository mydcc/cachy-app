---
id: FEAT-0303
title: One rule schema alerts, backtests and bots all read
type: feature
status: specced
priority: P1
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0027]
start_date: 2026-08-25
target_date: 2027-03-15
size: M
estimate: 5
---


# FEAT-0303 One rule schema alerts, backtests and bots all read

## Problem

"RSI below 30 on the 4h close" is one sentence, but the repository is on course to
express it three times: once in the alert engine
([`FEAT-0027`](FEAT-0027-alert-engine.md), done), once in whatever backtests
strategies, and once in the agent of
[`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md). Three expressions of one
sentence eventually disagree, and they disagree precisely between what the trader
tested and what the machine sent.

Today there is no declared, versioned format for a trading condition at all.
Every feature that needs one will invent it, and the second inventor will not
match the first.

## Proposal

Define and ship the rule document: a serialisable, versioned, schema-validated
description of conditions and an intended action, per
[ADR-0012](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md).

What a rule document holds:

- **Conditions** over indicator outputs, price and account state, with operator,
  threshold, symbol and timeframe. Indicator identity and parameters are named
  explicitly (`rsi`, period 14) — never a free-text expression.
- **Composition** of conditions, so [`FEAT-0030`](FEAT-0030-combined-alerts.md)
  has something to build on rather than beside.
- **An intended action** at a declared consequence level: notify, simulate, or
  send. A level that cannot honour a field refuses it explicitly, in the manner of
  [ADR-0008](../../adr/0008-refuse-unsupported-verbs-before-they-travel.md).
- **Evaluation point:** the closed candle of the named timeframe. Intrabar values
  do not decide.
- **Provenance:** schema version, authoring source (`human` or `model`), and a
  content hash that identifies this exact rule in a journal entry or decision log.

What this item builds is the schema, its validator, its serialisation, and the
migration rule for versioned documents. It does not build a UI and does not build
an executor.

The schema lives where the evaluation core lives: alongside
[`FEAT-0027`](FEAT-0027-alert-engine.md)'s Rust/WASM core, so the Android
companion of [`IDEA-0037`](../ideas/IDEA-0037-android-alert-companion.md)
consumes the same definition rather than a second one.

## Acceptance criteria

- A rule document round-trips through serialisation unchanged, and its hash is
  stable across round-trips
- A document authored under schema version N is either migrated to N+1 with
  meaning preserved, or refused with a stated reason — never silently reinterpreted
- Validation rejects unknown indicator identities, unknown operators, and unknown
  fields rather than ignoring them
- A rule naming consequence level `notify` is refused by any caller asking it to
  send, and the refusal names the field
- Evaluating one document twice over the same closed candles yields the same
  verdict
- A rule whose trigger references a third-party aggregate feed is refused at
  validation, per ADR-0012 decision 7
- No code path evaluates a rule by executing supplied text
- Rule documents are stored locally only; no path writes them to a server,
  telemetry sink, or debug log
- `FEAT-0027`'s existing price alerts are expressible in the schema, demonstrated
  by a test, without changing their firing behaviour

## Out of scope

- The condition-builder UI — that arrives with
  [`FEAT-0030`](FEAT-0030-combined-alerts.md)
- Backtesting, paper execution and live execution — separate items, later
  milestones
- Model-authored rules — [`FEAT-0304`](FEAT-0304-model-proposes-rules.md) depends
  on this schema, not the reverse
- The autonomy envelope (capital limits, promotion to live, failure modes) —
  belongs to `FEAT-0035`'s own ADR near M9

## Open questions

- **Does the schema describe account-state conditions from the start** (open
  position, unrealised PnL, exposure), or only market data? Bots need them;
  alerts mostly do not. Including them early costs schema surface, adding them
  later costs a migration.
- **How are multi-timeframe conditions expressed** — one rule naming several
  timeframes, or composition of single-timeframe rules? Both are defensible and
  the choice shapes what "the closed candle" means for a composed document.

## Links

- [ADR-0012](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`FEAT-0027`](FEAT-0027-alert-engine.md) — evaluation core this extends
- [`FEAT-0030`](FEAT-0030-combined-alerts.md) — first consumer with a UI
- [`FEAT-0035`](FEAT-0035-autonomous-execution-agent.md) — eventual executor
- [`IDEA-0037`](../ideas/IDEA-0037-android-alert-companion.md) — second consumer
  of the same core
- `calculateIndicatorsFromArrays`
  ([`src/utils/technicalsCalculator.ts:113`](../../../src/utils/technicalsCalculator.ts))
- `StatefulTechnicalsCalculator.update`
  ([`src/utils/statefulTechnicalsCalculator.ts:71`](../../../src/utils/statefulTechnicalsCalculator.ts))
