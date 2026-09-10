---
id: FEAT-0390
title: Price alert conditions beyond a single target
type: feature
status: done
assignee: claude
branch: claude/super-alert-next-task-mpte57
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
depends_on: [FEAT-0389]
size: L
estimate: 8
---

# FEAT-0390 — Price alert conditions beyond a single target

## Problem

The only price alert Cachy can express is "price reached X". A trader watching a
breakout wants "rises above", a trader watching a stop wants "falls below", and a
trader watching volatility wants "moves 5% either way" — three different questions
that all collapse into one ambiguous threshold today.

## Proposal

Four condition types in the Price tab, plus a price source:

| Type | Maps to |
|---|---|
| Rises above | `Condition::Cross { direction: above }` |
| Falls below | `Condition::Cross { direction: below }` |
| Rise reaches *n*% | `Condition::Compare` against a percentage move |
| Fall reaches *n*% | `Condition::Compare` against a percentage move |

Price source: last price or mark price. On a perpetual these differ, and a stop that
should key off the mark price but keys off the last is a wrong alarm at the worst
moment.

No new Rust: every one of these is an existing `Condition` variant. Percentage moves
are `Decimal` throughout — no floats, per the non-negotiable rule in `AGENTS.md`.

## Acceptance criteria

- [ ] All four types arm and fire correctly against recorded historical data
- [ ] "Rises above" does not fire when the price was already above at arming time —
      it is a crossing, not a comparison
- [ ] Last price and mark price are selectable and the choice is visible on the armed rule
- [ ] Percentage moves are measured from a reference point stated on the rule, not from
      an implicit one
- [ ] Percentages and prices go through `decimal.js` / `Decimal` with no float step
- [ ] German and English strings

## Out of scope

- The slider preset UI. Nice, not load-bearing; add it after the conditions are right.

## Decisions (2026-09-09)

**The reference point for a percentage move is a closed candle `lookback` closes
back.** The three candidates were the price at arming, the previous close, and the
session open. The price at arming needs no Rust at all — it bakes an absolute
threshold into a `Constant` — but it is tied to one symbol at one instant, so it
cannot be carried into a template ([`FEAT-0391`](FEAT-0391-alert-template-library.md))
or proposed by a model ([`FEAT-0304`](FEAT-0304-model-proposes-rules.md)), and the
content hash would then record "threshold 105000" rather than "5% move rule". Session
open needs a session and timezone model the evaluator does not have. A closed candle
is the only reference a backtest and a live run can agree on, which is the claim
ADR-0012 exists to make true. `lookback` generalises "previous close" to "over *n*
closes", which is what the volatility case actually wants.

**Last vs. mark price is implemented, not deferred.** This contradicted the item's own
"no new Rust": `Operand::Price` had no way to say which series it read, and the
evaluator receives one candle series per timeframe. Both were extended.

**Neither addition needs a migration.** `source` defaults to `last` and is skipped on
serialisation; `percent_change` is a new variant. Every stored document keeps its exact
canonical form and therefore its content hash, so there is no schema version bump.

## State (2026-09-09)

Shipped in PR #2927. What exists:

- `PriceSource` and `Operand::PercentChange` in `technicals-wasm/src/rule/condition.rs`,
  resolved per series in `evaluate.rs` — each operand indexes its *own* series, because
  the mark and last series are fetched separately and need not be the same length.
- A mark request is refused where the venue cannot serve one: Bitunix takes
  `type=MARK_PRICE`, Bitget's mix candles endpoint is last-price only and says so
  through `supportsMarkKlines`.
- `markCandleCache.ts` — the alert engine's own mark-candle cache, not `marketState`
  (ADR-0009). Fetched per series the first time an armed rule reads it; a 501 is
  recorded rather than re-asked.
- `PriceTab.svelte` with the four conditions, and the Manage tab's quick-add form
  removed as [`FEAT-0389`](FEAT-0389-super-alert-panel.md) said it would be.

What is open:

- Bitget mark candles. `/api/v2/mix/market/history-mark-candles` exists; wiring it is
  its own change. Until then a mark rule on Bitget stays indeterminate and says so.
- The slider preset UI, which was out of scope here and still is.
- Not exercised against a live venue: the mark-kline request path is covered by tests,
  not by a real round-trip.

## Links

- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the panel this tab lands in
- [`FEAT-0027`](FEAT-0027-alert-engine.md) — the price alerts that ship today
- `technicals-wasm/src/rule/condition.rs`
- Done 2026-09-10: merged via #2927; first release containing it TBD by the next chore(release).
