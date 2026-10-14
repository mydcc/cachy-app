# Cards: volume

Two indicators, both measuring participation rather than price. Volume answers
"how much was traded", which is a different question from "what happened to
price" — and the two are related often enough that the difference is worth
stating.

---

## obv

**What it measures.** Granville's running total (1963): it adds the volume of
every candle closing above the prior close and subtracts the volume of every
candle closing below it (an unchanged close counts zero). The line's **slope**
is the reading. The line's **level** is not.

**How to read it.** Whether the total is rising or falling while price moves, or
fails to move. Rising OBV with rising price means the advance is being paid for;
rising OBV with falling price means selling is being absorbed. Divergence
between price and OBV is the usual event.

**When it lies.**
- **The level is meaningless — this is the defining constraint.** OBV is a
  cumulative total, so its value depends on how much history has been loaded.
  The same market through a different rolling window produces a different OBV
  level. **Only the slope carries information; the absolute number does not.** A
  lesson, a chart or an alert that treats an OBV value as a level to compare
  against a threshold is wrong at the foundation.
- **It is a sign convention, not a magnitude.** A huge down-candle with tiny
  volume barely moves it, and a quiet candle with large volume moves it a lot.
  The total reflects volume and candle direction equally, which is not the same
  as money flow.
- **It cannot be compared against a price.** Different units, no shared scale.
  Only the direction of change is comparable.
- **It inherits the volume-quality problem.** A fragmented or thin volume feed
  makes this reading unreliable in ways the number itself does not reveal.

**Pairs with.** Volume confirmation of a price claim, and divergence work. Read
the slope, never the level.

**On the chart.** Separate volume-dimension axis below the price, single line.

---

## volume_ma

**What it measures.** The SMA(20) of volume. Like the moving
averages in `trend.md`, applied to volume instead of price.

**How to read it.** How much the current bar's volume differs from recent
normal. A breakout on clearly above-normal volume means something different from
one on unusually thin volume, and this is what makes that comparison concrete.

**When it lies.**
- **It has no direction.** Volume is unsigned. It cannot say whether buyers or
  sellers were active — `obv` above is where that comes from, and even there it
  is a convention.
- **"High volume" is relative to itself.** A normal volume reading on an
  instrument during a quiet period is not comparable to a normal reading during
  an active one. Absolute volume levels are not portable across instruments.
- **It describes the past N periods, not the current bar.** A spike on the last
  candle has barely entered the average. Comparing the current bar against an
  average that already includes it understates the spike.
- **It cannot distinguish accumulation from distribution.** High volume is high
  volume; who was doing it is not in this number.

**Pairs with.** Sizing conviction behind a price move, and filtering breakouts
whose volume does not support them.

**On the chart.** Separate volume-dimension axis below the price, single line.

---

## Links

- [`README.md`](README.md) — what a card is and is not
- [`oscillators.md`](oscillators.md) — mfi, the one member of this family that
  does weight price by volume
- [`trend.md`](trend.md) — the moving-average family, applied to price
- FEAT-0677 — the Academy indicator category these cards feed
- `src/lib/alerts/indicatorCatalogue.ts` — parameters, defaults, outputs
- `technicals-wasm/src/rule/indicator.rs` — the authoritative registry
