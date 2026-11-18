---
id: IDEA-0827
title: A backtesting engine for rule documents — replay history, honestly
type: idea
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: core
data_class: A
adr: ADR-0012
depends_on: []
size: XL
estimate: 34
---

# IDEA-0827 — A backtesting engine for rule documents, honestly

## Problem

Until a strategy runs live on the paper account, the only way to believe in
it is the trader's own conviction. A backtest would answer "what would this
exact rule document have done?" — and today nothing in the product can.

This is deliberately **not** part of the bot epic (FEAT-0805 lists a
backtesting engine as out of scope): done half-way, a backtest is more
dangerous than none, because it produces confident curves from questionable
assumptions (look-ahead bias, missing fees, cherry-picked windows). The
product owner confirmed (2026-11-18): record it as its own idea for later.

## What it would have to be to be honest

- **Replays the same document.** The input is the validated `RuleDocument`
  (or grid document) — the identical artifact the live engine evaluates,
  hashed, no parallel semantics (ADR-0012).
- **No look-ahead, ever.** Evaluation sees only candles that were closed at
  that point in time; indicator warmup is honored exactly as live
  (`MAX_RULE_WARMUP_CANDLES`).
- **Fees and slippage are part of the answer**, not an afterthought — the
  paper fee model applies, and the grid fee-vs-spacing rule
  (see FEAT-0819) is checked in the report.
- **Report shows both truths**: realized closed-trade curve *and*
  mark-to-market equity, because closed-trade-only reporting flatters grids
  and bots alike.
- **Historical market data is Class C** and versioned; the strategy under
  test and the results stay on the device (Class A).

## Why it is hard (and parked)

Reliable multi-timeframe history at depth, storage budget on the device,
run-time for thousands of evaluations, and a reporting UI that does not
tempt its user into over-fitting. None of it blocks the live paper path,
which remains the honest forward test.

## Links

- [`FEAT-0805`](../features/FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
  (out of scope, deliberately)
- [`FEAT-0819`](../features/FEAT-0819-grid-bot-runtime-on-the-paper-account.md)
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`ADR-0016`](../../adr/0016-a-claim-about-a-window-is-an-operand.md)
