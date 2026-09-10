# ADR-0016: A claim about a window of candles is an operand, not a fifth condition shape

- **Status:** Accepted
- **Date:** 2026-09-10
- **Deciders:** pheinze82

## Context

`technicals-wasm/src/rule/condition.rs:18-35` opens with "Four shapes, no
more" and then lists them: `compare` reads one closed candle, `cross` reads two,
`account` reads position state, `group` combines. A fifth variant,
`external_feed`, exists only so that ADR-0012 decision 7 can refuse it inside
`conditions` with a reason that cites the decision — the house pattern of making
a thing nameable so it can be rejected precisely instead of leaving it
unsayable and having the feature reappear in some other format later.

Two wanted conditions do not fit any of them, and they turn out to be the same
shortfall rather than two:

- **Divergence**, the last of FEAT-0028's three schema gaps. "Price made a
  higher high while RSI made a lower high" is a claim about two swings, not
  about one candle or the step between two.
- **John Bollinger's Squeeze**, found while closing gap 2 in
  [#3123](https://github.com/mydcc/cachy-app/pull/3123). His definition is the
  *lowest* bandwidth over a long lookback — a rolling minimum. What #3123 ships
  is `bandwidth < 0.5`, an absolute threshold, which is a usable proxy and is
  not the thing traders mean by the word.

Three facts from the existing code shape the answer more than any argument
does:

1. **The schema already has a lookback, and it sits on an operand.**
   `Operand::PercentChange { field, source, lookback }` reads a candle
   `lookback` closes back and returns a percentage
   (`condition.rs:195-201`). A condition that reads history is therefore not a
   new idea here; a *condition shape* that reads history would be.
2. **Operands already carry units.** `Operand::dimension()` returns a
   `Dimension` per operand and per indicator *output*
   ([#3122](https://github.com/mydcc/cachy-app/pull/3122)), and
   `Condition::check_dimensions` refuses a comparison whose sides disagree.
   Anything expressed as an operand inherits that guard for free; anything
   expressed as a condition needs its own copy of it.
3. **A rule that cannot warm up is silent, not refused.**
   `src/lib/rules/ruleEvaluationGate.ts:64` returns `undefined` while
   `closedCandles < ruleSchema.warmupCandles(document)`. There is no upper bound
   and no distinct signal, so an alert whose history requirement can never be
   met is indistinguishable from one that has not warmed up yet. `PERIOD` in the
   registry already permits 5000, so the hazard pre-dates this proposal — but a
   window multiplies it, because the window length adds to the inner indicator's
   own warmup. ADR-0009 is the cost side of the same fact: Bitunix delivers 200
   rows per response and `HistoryFetcher.ensureHistory()` pages backwards to go
   deeper, so history is available but is paid for in requests.

## Decision

Add one operand. Add no condition shape.

```rust
Operand::Window {
    of: Box<Operand>,
    agg: WindowAgg,   // Min | Max
    lookback: u32,    // candles, inclusive of the current close
}
```

The two wanted conditions are then compositions of what already exists:

- **Squeeze** — `compare(bollinger.bandwidth, lte, window(min, 120, bollinger.bandwidth))`
- **Bearish divergence** — `group all [ compare(price.high, gte, window(max, N, price.high)), compare(rsi, lt, window(max, N, rsi)) ]`

"Four shapes, no more" stays literally true, and the module doc needs no
amendment.

Rules a reviewer can check a pull request against:

1. **No fifth `Condition` variant.** A claim about a window is a value, so it
   belongs where values live.
2. **`Window` inherits its inner operand's dimension.** `dimension()` delegates
   to `of`. A window of a volume is a volume; a window of `bandwidth` is a
   percent. Dimensional safety is not re-implemented.
3. **`Window` does not nest.** `of` must not itself be a `Window`; that is a
   refusal with its own `RefusalCode`, not a depth budget. A minimum of a
   maximum is a sentence nobody writes on purpose, and refusing it keeps
   `warmup_candles` from compounding.
4. **`warmup_candles` is `of.warmup_candles() + lookback - 1`, saturating.**
   Stated so the number is auditable rather than discovered when an alert stays
   quiet.
5. **`lookback` is bounded, and total warmup is bounded.**
   `MAX_RULE_WARMUP_CANDLES = 500`, decided 2026-09-10. A document whose total
   warmup exceeds it is refused at validation with a reason naming both the
   figure and which tree — `conditions` or `veto` — carries it, the point of
   fact 3 above. `lookback`
   itself is `2..=500`, which is the same number for a different job: it is a
   per-operand sanity filter, while the 500 that decides an alert's fate is the
   *total*. The two are not redundant and they are not in conflict —
   `window(min, 500, ema(50))` passes the first and is refused by the second at
   550, which is the intended reading.

   500 is a chosen figure, not a measured one, and it is chosen on the safe
   side: it admits `window(min, 200, bandwidth(20, 2))` at 220 and Bollinger's
   own 120-candle Squeeze at 140, while refusing the depths where ADR-0009's
   paging turns an alert into a download. If real use shows it too tight, the
   fix is a new figure in one constant with a note here — not a per-rule
   override.
6. **`Min` and `Max` only.** No `Mean`: `volume_ma`, `sma` and `ema` already
   average, and a second way to say the same thing is a second thing to keep
   consistent. Add it when a condition needs it and cannot be written.
7. **Nothing existing serialises differently.** A new operand variant leaves
   every stored document's canonical form untouched, so no content hash moves
   and no migration is needed — the same property that made `PriceSource::Mark`
   and `Operand::Volume` free.

## Consequences

### What this enables

Bollinger's actual Squeeze, expressed exactly rather than approximated. "At a
20-candle high", "has not been this low in 200 candles", "volume at its
highest of the session so far" — a family, from one variant. And a divergence
that a backtest and a live run agree on, because every input is a closed
candle and an aggregate over closed candles.

Every exhaustive `match` over `Operand` — `validate`, `dimension`,
`warmup_candles`, `price_source`, and the evaluator's `operand_at` — fails to
compile until the new arm is handled. The compiler enumerates the work, which
is the same property that made the volume operand safe to add.

### What this costs

**It is not swing-pivot divergence.** `price.high >= max(price.high, N)` while
`rsi < max(rsi, N)` says "price is at an N-candle high and RSI is not", which
overlaps a classical divergence without being it: no pivot is identified, and
two swings are never paired. A trader who knows the textbook picture will read
the rule sentence and expect the textbook thing. That gap has to be visible in
the UI copy, not just in this file.

Refusing to identify pivots is deliberate, and it is the same call ADR-0012
decision 3 already made about VWAP: a swing needs a pivot-strength parameter,
pivot strength depends on how much future the detector is allowed to see, and a
detector that sees future candles in a backtest and cannot in a live run
produces a rule that means two different things. Ruling that out costs the
textbook shape.

**History gets expensive.** `window(min, 200, bandwidth(20, 2))` needs 220
closed candles before it says anything. On `1d` that is most of a year, paid for
in paged requests per ADR-0009. Rule 5 exists so the refusal happens at
authoring time; without it the alert is simply quiet, and quiet is the failure
mode this app can least afford.

**`Box<Operand>` makes `Operand` recursive.** Rule 3 keeps the recursion one
level deep, but the type no longer says so by itself — the guarantee moves from
the shape into a validation rule, which is a genuine downgrade and the reason
rule 3 is a refusal rather than a convention.

### What is now forbidden

- Adding a `Condition` variant for divergence, for squeeze, or for any other
  claim expressible as an aggregate over a window of one operand.
- A `Window` whose `of` is a `Window`.
- A pivot- or swing-detection primitive whose result depends on candles later
  than the one being evaluated, in any shape, per ADR-0012 decision 3.
- Shipping a window operand without the warmup ceiling of rule 5, because the
  gate's silence is not a usable error.
- Making `MAX_RULE_WARMUP_CANDLES` a user setting, per the alternative below.

## Alternatives considered

**A fifth condition shape, `Condition::Window`.** Rejected on mechanism. The
claim being made is about a *value* — "the lowest bandwidth in 120 candles" is a
number — and putting it in `Condition` means writing its own dimension check,
its own `timeframes` arm, its own `mark_timeframes` arm and its own
`warmup_candles` arm: four exhaustive matches, where the operand form needs one
delegating function. It would also make the module doc's own sentence false,
which is a small thing that is never only a small thing.

**A dedicated `Condition::Divergence { indicator, price, side, lookback }`.**
Rejected twice over. It is a special case where a mechanism is available, so
the *next* window-shaped condition starts the same argument again. And its
honest implementation needs pivot detection, which ADR-0012 decision 3 already
excluded VWAP for: a parameter whose backtest and live values disagree is not a
rule input. A dedicated shape would hide that behind a friendly name.

**Nothing — keep absolute thresholds.** This is what #3123 shipped, and it
deserves stating as a real option rather than a straw man: `bandwidth < 0.5`
works, it is cheap, it needs no history, and a trader who tunes the constant to
their market gets a usable squeeze alert. It is rejected as the *end state*
because the number is market-specific and silently wrong when carried to
another symbol — the same objection `Operand::PercentChange`'s doc comment makes
about a threshold baked in at arming time, which is the difference between a
rule and a bookmark.

**The ceiling as a per-trader setting.** Proposed on the grounds that every
trader is different, which is true, and rejected because of *when* the number
would be read. A rule's warmup requirement is fixed at authoring time; the
setting would be read at evaluation time, every time. Lowering it after the
fact does not refuse the rules it invalidates — `ruleEvaluationGate.ts:64`
returns `undefined` and the alert simply stops firing, with no event, no
refusal and nothing in the UI that distinguishes it from a rule still warming
up. That is the exact failure this ADR's fact 3 is about, converted from a
hazard into a setting. It is also ADR-0012 decision 3 in another costume: a
value that changes the meaning of a stored rule without touching it is not a
rule input. A trader who needs 800 candles should get a refusal that says 500
while they are writing the rule, and an issue to argue the constant up — not a
switch that silently disarms yesterday's alerts.

**An expression language.** Not considered, and named here so the silence is
not mistaken for an oversight: ADR-0012 decision 1 forbids deriving a rule's
meaning from supplied text, and `Operand` has no string variant by construction.

## Links

- [`ADR-0012`](0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md) — decisions 1, 3 and 7 all bear on this
- [`ADR-0009`](0009-candle-depth-and-background-store-isolation.md) — what deep history costs
- [`FEAT-0028`](../backlog/features/FEAT-0028-indicator-alerts.md) — the gap this closes
- `technicals-wasm/src/rule/condition.rs` — the four shapes, and `Dimension`
- `src/lib/rules/ruleEvaluationGate.ts` — why an unmeetable warmup is silent
