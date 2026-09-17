---
id: FEAT-0477
title: Offer intra-candle evaluation as an explicit per-alert opt-in
type: feature
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0028]
size: M
estimate: 8
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
  See the self-collision hazard below — this is sharper than it first looks.
- **Repaint.** A condition true mid-candle can be false at the close. The trader has
  to be told at arming time and in the fired notification that the value was not
  final.
- **Content hash.** Decided below: the mode is hashed, and `close` is omitted from
  the serialised form so nothing stored today moves.

## Decisions (2026-09-17)

**The mode belongs on the rule document, inside the content hash.**
`trigger_timeframe` is hashed because it says *at which instant* a condition is
read. `close` versus `intrabar` is that same axis at a finer grain: "RSI above 70
at the 4h close" and "RSI above 70 at any moment inside the 4h candle" are two
different statements about the market, not two ways of announcing one. That is the
line FEAT-0393's lifecycle fields sit on the other side of — `frequency`,
`trigger_methods`, `valid_until_ms` and `note` change how loudly a rule speaks and
are deliberately unhashed, because a journal entry naming one must keep matching
the other. An evaluation mode fails that test: the same hash would no longer
identify a strategy that can be replayed against a candle series and produce the
same triggers.

Acceptance criterion 1 still holds without a schema migration, by the mechanism
this repo has already proved twice — `PriceSource` in FEAT-0390 and
`IndicatorRef.field` in FEAT-0454: the default is dropped from the serialised
document, so every rule written before the field existed hashes exactly as it
hashes today.

**Consequence — this is not a TypeScript-only change.** The hash is computed in
Rust (`technicals-wasm/src/rule/document.rs`); `src/lib/rules/types.ts` only
mirrors the wire shape. The field is added there, and the committed
`static/wasm/` artefacts must be rebuilt in the same PR, because those artefacts
are what the app actually loads and they do not fail loudly when they lag the Rust
source.

**An `intrabar` alert fires at most once per candle and does not re-arm inside
one.** A condition that turns true, false and true again inside one candle is
exactly the repaint case the trader was warned about at arming time; re-arming
would turn one uncertain event into a stream of contradictory alerts about the
same candle. Across candles nothing changes — `frequency` keeps its current
meaning, and no second knob is introduced.

**Hazard found while grooming: the gate's anchor collides with itself.**
`RuleEvaluationGate` keeps one `ruleId → lastEvaluatedAnchorMs` map and rejects
any anchor at or before the last decided one — deliberately, so a replayed or
corrected candle cannot fire twice. But an open candle and that same candle once
closed share one `open_time_ms`. An intrabar evaluation would therefore record
the anchor while the candle is still open, and the close of that very candle
would then be withheld as already-decided: the alert fires on the provisional
value and never corrects itself. The intrabar path needs its own last-anchor
record and must not write into the closed-candle one. Keeping the two records
separate is what makes acceptance criterion 4 structural instead of a matter of
care.

## Acceptance criteria

- [ ] `close` stays the default and is omitted from the serialised document; a test
      asserts an existing stored alert keeps both its behaviour and its content hash
- [ ] An `intrabar` alert fires on the open candle and at most once per candle,
      including across reconnects and corrected candles
- [ ] The close of a candle an intrabar alert already fired on is still evaluated —
      the provisional fire does not consume the closed-candle anchor
- [ ] Closed-candle alerts are unaffected — the FEAT-0028 AC3 tests still pass
      unchanged
- [ ] The arming UI and the fired notification state that an intra-candle value
      may revert, in German and English
- [ ] The rebuilt `static/wasm/` artefacts ship in the same PR as the Rust change

## Out of scope

- Tick-level or sub-candle timeframes; the open candle of the trigger timeframe is
  the finest grain.
- Changing the default for any existing alert.
- Re-arming inside a single candle, and any change to `frequency` semantics —
  both decided above.

## Links

- [`FEAT-0028`](FEAT-0028-indicator-alerts.md) — origin, AC2
- [`FEAT-0387`](FEAT-0387-expose-rule-evaluator.md) — closed-candle evaluation
- [`FEAT-0390`](FEAT-0390-price-alert-conditions.md) and
  [`FEAT-0454`](FEAT-0454-alert-on-indicator-price-source.md) — the omit-the-default
  precedent this item reuses to keep existing content hashes
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
