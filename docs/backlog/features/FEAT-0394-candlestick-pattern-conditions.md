---
id: FEAT-0394
title: Candlestick pattern conditions
type: feature
status: specced
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0387, FEAT-0389]
size: M
estimate: 5
---

# FEAT-0394 — Candlestick pattern conditions

## Problem

Cachy already detects candlestick patterns — `src/services/candlestickPatterns.ts`
exists and the chart uses it. A trader cannot arm an alarm on one. "Tell me when a
hammer prints on the 4h" is a normal request and currently has no answer.

## Proposal

A Candlesticks tab with three groups, each a tile grid showing the pattern shape and a
one-line meaning:

| Group | Patterns |
|---|---|
| Single | Hammer, Inverted Hammer, Shooting Star, Hanging Man |
| Multiple | Engulfing, Piercing, Dark Cloud Cover, Harami |
| Structural | Morning Star, Evening Star, Three White Soldiers, Three Black Crows |

A new `Condition::Pattern { pattern, timeframe }` variant in
`technicals-wasm/src/rule/condition.rs`, evaluated on closed candles like everything
else, so a pattern that forms and un-forms inside a live candle cannot fire.

Detection reuses `candlestickPatterns.ts` rather than reimplementing it in Rust —
**unless** that would put pattern detection on a different path from the evaluator, in
which case port it and delete the duplicate. Two implementations of "is this a hammer"
is exactly the split this whole architecture exists to avoid.

## Acceptance criteria

- [ ] Each pattern fires correctly against recorded historical data, tested per pattern
- [ ] Patterns are evaluated on closed candles; a pattern that un-forms before the close
      does not fire
- [ ] `Condition::Pattern` round-trips through `parse_document` / `serialise_document`
      and is covered by the content hash
- [ ] An unknown pattern name is refused by name, not silently ignored
- [ ] Pattern detection has exactly one implementation, and this item says which
- [ ] `warmup_candles()` accounts for multi-candle patterns
- [ ] German and English pattern names and descriptions

## Out of scope

- Chart-pattern (not candlestick) conditions — head and shoulders, triangles. Different
  detection, different item.

## Open questions

- **Rust or TypeScript detection?** Deciding this is part of the item, not a
  precondition; the acceptance criterion is that there is only one answer afterwards.

## Links

- `src/services/candlestickPatterns.ts`, `technicals-wasm/src/rule/condition.rs`
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md)
- Reference behaviour: Bitunix "Super Alert" Candlestick tab (described, not reproduced)
