---
id: FEAT-0303
title: One rule schema alerts, backtests and bots all read
type: feature
status: in-progress
assignee: claude-code
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

## Decisions taken

Both open questions were settled before the schema was written, because both
shape the serialised surface and getting either wrong costs a migration of rules
already armed on real accounts.

**Account-state conditions are in from v1**, as their own condition family
(`position` and `account`). Entry/exit asymmetry — "only when flat", "close when
unrealised PnL is below -2R" — is not expressible without them, and every
production rule engine (QuantConnect, Backtrader, NautilusTrader) treats
portfolio state as a first-class predicate for that reason. Consequence level
`notify` refuses the family explicitly in the manner of
[ADR-0008](../../adr/0008-refuse-unsupported-verbs-before-they-travel.md): the
alert engine evaluates against a price feed and holds no position book, so an
alert carrying "only when flat" would be a guard nothing ever checks, and a
trader who believed in it would be worse off than one told no.

**Multi-timeframe conditions use per-condition timeframes under one declared
trigger timeframe.** The document names exactly one evaluation anchor; each
condition names its own timeframe and is read at the last candle of that
timeframe which had *already closed* at the trigger close. Validation enforces
that every condition timeframe is coarser than or equal to the trigger and an
exact multiple of it — a finer condition is refused, because reading it only at
each trigger close would silently discard closes the rule appears to consider.
This is the standard shape (TradingView's `lookahead_off`, NautilusTrader,
QuantConnect consolidators) and the only one that structurally rules out
lookahead bias, which is what makes a backtest result and a live result the same
claim under
[ADR-0012](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
decision 3.

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

## What shipped

The schema, its validator, its serialisation, its content hash and its migration
rule, as `technicals-wasm/src/rule/` — alongside FEAT-0027's evaluation core, so
the Android companion of `IDEA-0037` consumes one definition rather than a
second.

| Module | What it holds |
|---|---|
| `document.rs` | `RuleDocument`, provenance, canonical form, content hash |
| `condition.rs` | The condition tree: compare, cross, position, account, group, external feed |
| `indicator.rs` | The indicator registry and parameter validation |
| `consequence.rs` | `notify` / `simulate` / `send` and what each refuses |
| `timeframe.rs` | Timeframe parsing, normalisation, trigger-anchor arithmetic |
| `version.rs` | Schema version and the migrate-or-refuse chain |
| `evaluate.rs` | Deterministic evaluation over closed candles |
| `legacy.rs` | FEAT-0027 alert → rule document, with the differential test |
| `refusal.rs` | Refusals that name a field and carry an i18n key |
| `sha256.rs` | Self-contained SHA-256 for the content hash |
| `exports.rs` | The wasm-bindgen surface |

Notes on three choices a reviewer will want the reasoning for:

- **The content hash covers meaning, not bytes.** `id`, `name`, `enabled` and
  `provenance` are excluded, so renaming a rule or arming it does not read as a
  strategy change in a decision log, while any change to symbol, timeframe,
  conditions or action does. `canonical_value` removes an excluded list rather
  than assembling an included one, so a field added later is hashed by default.
- **SHA-256 is hand-rolled rather than pulled from `sha2`.** The committed
  `Cargo.lock` holds no hashing crate; adding one churns the lock, pulls five
  transitive crates into a binary whose release profile was size-tuned in
  BUG-0314, and would not resolve offline. SHA-256 has published NIST vectors, so
  the usual objection — that a hand-rolled digest cannot be checked — does not
  apply, and the tests assert against them.
- **No `source` (price-source) parameter in v1.** The TypeScript
  `IndicatorSettings` declares one on rsi, macd, cci, momentum, ema and
  bollinger, but the WASM core has no such field and computes all of them on the
  close. Shipping a field the evaluator ignores would be a document claiming one
  thing while the engine does another.

Two indicator families are deliberately outside the registry and refused by
name: **VWAP** (session-anchored, so its value depends on a boundary not
derivable from the candle window) and **volume profile** (a distribution, not a
series). Both are chart features rather than rule features.

Also landed: `.github/workflows/rust-core.yml`. Nothing in CI ran `cargo test`
before it — `deploy-build.yml` compiles the crate only as a side effect of
`npm run build:wasm`, which `scripts/build_wasm.sh` exits 0 on when a toolchain
is missing.

Not built here, per Out of scope: the condition-builder UI, backtesting, paper
and live execution.
