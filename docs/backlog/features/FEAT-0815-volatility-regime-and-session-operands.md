---
id: FEAT-0815
title: Add volatility-regime and session operands for rule conditions
type: feature
status: done
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
assignee: claude
branch: feature/feat-0815-regime-session
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

- [x] `atr_percentile` evaluates against a known series and matches a JS
      reference within the project's indicator tolerance; it is refused with a
      clear reason when the series is shorter than warmup.
- [x] A session window evaluates correctly at the boundary (inclusive start,
      exclusive end), across midnight, and at a DST-free UTC reference.
- [x] Both are usable in a group with existing conditions and render in the
      sentence in both locales.
- [x] Warmup is reported correctly: ATR percentile adds `period + lookback` to
      the requirement and the builder shows it.
- [x] A session window with `from == to` is refused (empty or full day is
      ambiguous); a malformed time is refused with the field path.
- [x] The content hash changes when either operand changes; existing documents
      keep their hash.
- [x] Tests: core parity, boundary times, wraparound, warmup refusal.

## Decisions

- **Session is a `Condition`**, as proposed: "in session" is a truth value.
  `{ kind: "session", from, to, timezone: "UTC" }`, `from` inclusive, `to`
  exclusive, `from > to` wraps midnight; `from == to`, a malformed `HH:MM` and
  any timezone but `UTC` are refused (`invalid_session_window`) with the field
  path. The instant tested is the anchor candle's **close**, the moment the
  verdict is made — so a 1h candle closing at 16:00 is outside 08:00–16:00.
- **Where a session is refused.** On an `intrabar` rule the anchor is a candle
  still forming, so its close lies in the future and the window would open and
  shut up to one trigger interval early; a session anywhere in such a document
  is refused (`invalid_session_window`) rather than shifted. On a trigger of 1d
  or longer every close falls at 00:00 UTC, so the window would be constant;
  that is refused too. 4h and shorter are legal, read at their closes only.
- **ATR rank definition.** The share of the last `lookback` ATR values (the
  current one included) at or below the current one, times 100 — the maximum of
  the window reads 100 and ties cannot make the answer order-dependent. Built on
  the ATR series the alert path already computes (`atr` with `period`);
  `lookback` 2..=500, warmup `period + lookback`.
- **UI presets are not edition-specific** and expand to fixed UTC windows whose
  times are always shown in the label (Asia 00–08, Europe 07–16, US 13–21); the
  document stores the window, never a name.
- Existing documents keep their hash: no existing variant's serialisation
  changed, and the refusal wire-name test still pins every old code.

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
