---
id: FEAT-0394
title: Candlestick pattern conditions
type: feature
status: done
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0387, FEAT-0389]
size: L
estimate: 8
assignee: claude-code
---

# FEAT-0394 — Candlestick pattern conditions

## Problem

A trader cannot arm an alarm on a candlestick pattern. "Tell me when a hammer prints
on the 4h" is a normal request and currently has no answer.

**Corrected premise (2026-09-10).** An earlier draft of this item said Cachy already
detects these patterns and that the chart uses it. It does not.
`src/services/candlestickPatterns.ts` holds no detection logic: it is a library of
idealised example candles (`open: 50, high: 60, low: 40`) plus `keyFeatures` carrying
colours, radii and line widths — drawing instructions. Every consumer is Academy
teaching material (`CandlestickPatternsView.svelte`, `AcademyContent.svelte`,
`academy/+page.svelte`), and the chart that renders it is the lesson chart drawing
those invented candles, not the market chart.

There is no detection to reuse. This item builds it.

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

Detection is written in Rust, next to the evaluator. There is no TypeScript
implementation to reuse or duplicate (see Problem), so the only question was where the
one implementation should live. It lives where the conditions are evaluated: putting it
in TypeScript would mean handing candles back across the WASM boundary for every rule
and every timeframe, on the evaluation path.

`candlestickPatterns.ts` stays as it is — Academy teaching material. It shares pattern
*ids* with the new detector so the alert UI can reuse the existing illustrations and
translations, but no logic crosses between them.

## Acceptance criteria

- [ ] Each pattern fires correctly against recorded historical data, tested per pattern
      — **partially done.** Every pattern has a positive and a near-miss negative case
      in `pattern.rs`, but against constructed candles, not a recorded series. The
      constructed cases pin the geometry; they cannot show how often a pattern prints
      on a real instrument. See "Remaining" below.
- [x] Patterns are evaluated on closed candles; a pattern that un-forms before the close
      does not fire
- [x] `Condition::Pattern` round-trips through `parse_document` / `serialise_document`
      and is covered by the content hash
- [x] An unknown pattern name is refused by name, not silently ignored
- [x] Pattern detection has exactly one implementation, and this item says which
- [x] `warmup_candles()` accounts for multi-candle patterns
- [x] German and English pattern names and descriptions

## Remaining

- **Historical validation.** The detector is pinned by constructed candles on both
  sides of every threshold. What is not yet answered is the empirical question: how
  often each pattern prints on a real instrument, and whether the thresholds
  (`SMALL_BODY_MAX_SHARE` and friends) are set where a trader would agree. That needs
  a recorded series and a human reading the hits, so it is its own item rather than a
  loose end here.
- Nothing else. The condition is evaluated, translated, pickable and armed.

## Out of scope

- Chart-pattern (not candlestick) conditions — head and shoulders, triangles. Different
  detection, different item.

## Decisions

- **Rust detection.** Settled 2026-09-10 by inspecting the tree: there is no existing
  TypeScript detection, and the evaluator lives in `technicals-wasm/src/rule/`. The
  acceptance criterion "exactly one implementation" is satisfied by building only in
  Rust and leaving the Academy illustration library untouched.

- **`piercing_line`, not `piercing`.** 13 of the 14 detector ids already matched the
  Academy library's ids exactly; the odd one out was this item's own invention. Renamed
  the Rust variant to `PiercingLine` rather than adding a mapping table, because a
  mapping is a second place the two vocabularies can disagree. With the ids identical,
  reusing an illustration and a translation is not a lookup, it is identity — and the
  rename brought the existing German and English names with it for free.

- **The tab does not import the Academy library.** It shares the pattern *ids* and
  nothing else, as this item specifies. `candlestickPatterns.ts` is 49 KB covering 66
  patterns with drawing instructions for the lesson chart; the detector knows 14 and a
  tile needs none of the drawing metadata. The Candlesticks tab is code-split precisely
  to stay small, so it carries its own 14 tile glyphs and
  `patternCatalogue.test.ts` fails if any id loses its Academy counterpart.

- **Engulfing and Harami carry direction in the name.** The table above lists them
  without one. Split into bullish/bearish variants: the two cases call for opposite
  trades, so a direction-less alert would point a trader the wrong way half the time.

- **Group = arity.** Single / Multiple / Structural are exactly
  `CandlePattern::candles_spanned()` returning 1 / 2 / 3, so the UI grouping is derived
  from the engine rather than kept as a second list beside it.

## Links

- `src/services/candlestickPatterns.ts`, `technicals-wasm/src/rule/condition.rs`
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md)
- Reference behaviour: Bitunix "Super Alert" Candlestick tab (described, not reproduced)
