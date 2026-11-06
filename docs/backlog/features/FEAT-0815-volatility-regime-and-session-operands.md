---
id: FEAT-0815
title: Add volatility-regime and session operands for rule conditions
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
parent: FEAT-0805
size: M
estimate: 5
---

# FEAT-0815 — Add volatility-regime and session operands for rule conditions

## Problem

A rule can already read an indicator on a coarser timeframe than its trigger
(`Condition.timeframe`), so "4h trend agrees" needs no new primitive. What the
language cannot express is the context a trader actually filters on:

- **Volatility regime** — "only take this setup when ATR is in the top quartile
  of the last N candles", or "stop when volatility collapses".
- **Session** — "only between 08:00 and 16:00 UTC", "not during the Asia
  session", "avoid the funding window".

Without them, these filters end up as hand-waved notes or as separate alerts
that cannot share the trigger instant.

## Proposal

Add two deterministic primitives to the condition language:

1. `Operand::AtrPercentile { period, lookback }` — the percentile rank (0–100)
   of the current ATR over the last `lookback` values. ATR is already computed;
   the operand exposes its regime, not a new indicator. Dimension: percent.
   `lookback` bounds follow the window operand (2..=500) and count toward
   warmup.
2. `Condition::Session { from, to, timezone: "UTC" }` — true when the trigger
   instant falls in the window, with wraparound handled explicitly (22:00–02:00
   is valid). No named sessions in the core; the UI may offer presets that
   expand to UTC windows, so the document stays unambiguous.

Both are valid in `conditions`, `veto` and (later) `exits`. Neither reads a
third-party feed, so ADR-0012 decision 7 is untouched.

## Acceptance criteria

- [ ] `atr_percentile` evaluates against a known series and matches a JS
      reference within the project's indicator tolerance; it is refused with a
      clear reason when the series is shorter than warmup.
- [ ] A session window evaluates correctly at the boundary (inclusive start,
      exclusive end), across midnight, and at a DST-free UTC reference.
- [ ] Both are usable in a group with existing conditions and render in the
      sentence in both locales.
- [ ] Warmup is reported correctly: ATR percentile adds `period + lookback` to
      the requirement and the builder shows it.
- [ ] A session window with `from == to` is refused (empty or full day is
      ambiguous); a malformed time is refused with the field path.
- [ ] The content hash changes when either operand changes; existing documents
      keep their hash.
- [ ] Tests: core parity, boundary times, wraparound, warmup refusal.

## Out of scope

- External feeds (funding, open interest, fear-and-greed); FEAT-0816.
- Named sessions (Asia/London/New York) in the core; UI presets expand to UTC
  windows, the document stores the window.
- Volatility-based position sizing; this is a condition, not a sizing basis.
- Backtesting the regime filter.

## Open questions

- Whether session is a `Condition` or an `Operand` compared to a constant.
  Proposal: a `Condition`, because "in session" is a truth value, not a number.
- Whether the UI presets should be edition-specific; proposal: no, UTC windows
  are universal.

## Links

- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`ADR-0016`](../../adr/0016-a-claim-about-a-window-is-an-operand.md)
- [`FEAT-0813`](FEAT-0813-condition-builder-v2-more-conditions-and-nested-groups.md)
- Core: `technicals-wasm/src/rule/{condition,evaluate}.rs`
