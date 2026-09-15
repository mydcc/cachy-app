---
id: FEAT-0477
title: Offer intra-candle evaluation as an explicit per-alert opt-in
type: feature
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0028]
---

# FEAT-0477 — Offer intra-candle evaluation as an explicit per-alert opt-in

## Problem

Indicator alerts are decided once per close of the trigger timeframe. On a 4h or
1d alert that is up to a full candle between the market reaching a condition and
the trader hearing about it. Some setups — a breakout, an RSI spike on news — are
worth hearing about while the candle is still open, and today there is no way to
ask for that.

Split out of [`FEAT-0028`](FEAT-0028-indicator-alerts.md) acceptance criterion 2
on 2026-09-15: closed-candle evaluation is the architecture since
[`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md), and the intra-candle half is a
separate addition with its own risks rather than a tick box on that item.

## Proposal

A per-alert evaluation mode, `close` (default, today's behaviour) or `intrabar`,
chosen explicitly when the alert is armed. In `intrabar` mode the evaluator also
decides the still-open candle on each update and fires at most once per candle.

What makes this more than a flag:

- **Anchors.** `RuleEvaluationLoop` (`src/services/alertEngine/ruleEvaluationLoop.ts`)
  only yields an anchor once a strictly later open time appears, and
  `RuleEvaluationGate` (`src/lib/rules/ruleEvaluationGate.ts`) rejects any anchor at
  or before the last decided one. Both are the no-double-fire guarantee of
  FEAT-0028 AC3; an open candle shares its anchor with every tick inside it, so the
  mode needs its own "fired in this candle" state instead of weakening either guard.
- **Repaint.** A condition true mid-candle can be false at the close. The trader has
  to be told at arming time and in the fired notification that the value was not
  final.
- **Content hash.** If the mode is part of the rule document it moves the canonical
  form; if it is alert metadata it does not. Decide which before writing code.

## Acceptance criteria

- [ ] `close` stays the default; an existing stored alert keeps its behaviour and
      its content hash
- [ ] An `intrabar` alert fires on the open candle and at most once per candle,
      including across reconnects and corrected candles
- [ ] Closed-candle alerts are unaffected — the FEAT-0028 AC3 tests still pass
      unchanged
- [ ] The arming UI and the fired notification state that an intra-candle value
      may revert, in German and English

## Out of scope

- Tick-level or sub-candle timeframes; the open candle of the trigger timeframe is
  the finest grain.
- Changing the default for any existing alert.

## Open questions

- Mode on the rule document (hashed) or on the alert (not hashed)?
- Fire once per candle, or re-arm if the condition turns false and true again
  inside the same candle?

## Links

- [`FEAT-0028`](FEAT-0028-indicator-alerts.md) — origin, AC2
- [`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md) — closed-candle evaluation
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
