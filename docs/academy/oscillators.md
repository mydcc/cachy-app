# Cards: oscillators

Bounded, mean-reverting readings. The family where a plain threshold is the
condition a trader actually wants, and the family where the threshold is most
often quoted as if it were a law of nature.

Oscillators answer "how far has price moved from where it was" — not "where is
price going". That distinction is the source of nearly every failure below.

---

## rsi

**What it measures.** Relative strength of gains versus losses, as a value
between 0 and 100. 50 marks balance; the distance from 50 is the strength of
one side. Wilder smoothing over the configured period decides what "recent"
means. Computed over the default price, so it can follow another price source
where that is meaningful.

**How to read it.** Above 50 leans toward buyers, below 50 toward sellers.
That is a tendency, not a signal. 70 and 30 are conventional outer marks for
a move stretched against its own recent history, not buy or sell signals. The
reliable reading is usually the shape, not the level. Regular divergence —
price makes a higher high while RSI makes a lower high, or price a lower low
while RSI a higher low — points to a possible reversal. Hidden divergence —
price makes a higher low while RSI makes a lower low in an uptrend, or a
lower high while RSI makes a higher high in a downtrend — points to
continuation. Either counts only where the chart already gives the move a
reason: at a boundary, after a break, at a level that already matters.

**When it lies.**
- **In a trending market.** RSI stays above 70 or below 30 for as long as the
  trend lasts. In a strong uptrend it reads overbought on almost every candle,
  and trading that as a sell signal collects small losses against one large
  move. Shorter periods reach the outer marks sooner and fail sooner here.
- **Divergence inside a range.** Two highs in a sideways market where price
  oscillates between the same levels still produce a divergence. Divergence
  claims momentum is failing, and in a range there is no momentum to fail.
- **Overbought is not expensive.** "Overbought" means stretched against recent
  history, not expensive in absolute terms. A new high can be healthy; the
  reading only says the climb was fast.
- **A window with no movement has no value** and resolves as indeterminate,
  not as a number.

**Pairs with.** Reversal setups at range boundaries, confirmed at the boundary
(level holds, candle rejects, room before the next barrier), with a defined
stop beyond the level. Trend continuation is not its job — that is where an
overlay on the price itself (see `trend.md`) carries the signal instead.

**On the chart.** Separate percentage axis below the price, fixed 0–100.

---

## stoch_rsi

**What it measures.** The stochastic of the RSI. Applies the stochastic's
position-within-range logic to RSI values rather than to price. %K and %D,
both 0–100, reading where RSI currently sits within its own configured range.

**How to read it.** Crosses of %K over %D are the usual event. The outer marks
at 80 and 20 are convention, not buy or sell signals. The middle line at 50
splits the range in two halves: above it, the RSI stands in its upper half,
and a cross above it confirms the direction of the RSI push — also no buy or
sell signal. Read it as a statement about where the RSI is inside its own
range, not as a statement about price.

**When it lies.**
- **Double smoothing hides the thing you wanted to see.** A stochastic of a
  stochastic reaches its extremes far more often than the underlying RSI does,
  so readings that would be rare on the RSI are routine here. Shorter ranges
  reach the outer marks sooner and fail sooner in trends.
- **In a trend it sticks to the extremes.** At 100 in an uptrend, at 0 in a
  downtrend, for as long as the trend lasts — instead of warning of the turn.
- **Inherited every RSI failure, then some.** Whatever made the RSI misleading
  in a trend makes this misleading in a trend, and the extra transform removes
  the absolute level information that would have told you which regime you are
  in.
- **Its range is RSI-relative, not price-relative.** "At the top of its range"
  refers to where RSI is, not to where price is. A strongly rising price can sit
  at a low stochastic if RSI has been rising even faster.
- **A range with no movement has no value** and resolves as indeterminate,
  not as a number.

**Pairs with.** Very short mean-reversion entries in genuinely quiet conditions.
It is a precision tool for a narrow case, not a general-purpose oscillator.

**On the chart.** Separate percentage axis, 0–100, two lines.

---

## stochastic

**What it measures.** Where the close sits within the highest high and lowest
low of the configured window. %K is that position smoothed, %D is a moving
average of %K. Both run 0–100, computed from high, low and close. With smoothing
it shows the slow variant in the default setting, the calmer one with the more
reliable signals.

**How to read it.** %K above 80 means the close sits near the top of the
configured window's range. Below 20 it sits near the bottom. Those are positions,
not signals — the 80 and 20 marks are convention, not buy or sell signals. %K
crossing %D is the event most systems are built on. The strongest reading is
divergence as with RSI, read on the %D line in the extreme zone: %D forming
falling peaks while price keeps rising, or rising troughs while price keeps
falling, warns of the turn. Reading that as "the market is nearly finished
rising or falling" confuses the window with the market: the statement covers the
configured window, not the future.

**When it lies.**
- **In any trend, permanently.** This is the defining failure. In a sustained
  uptrend the close keeps sitting near the window high and %K stays above 80
  for the length of the trend. A rule that sells every overbought print in a
  trend is systematically short the only move that matters. Mirrored, the same
  holds in a downtrend: the close sits near the window low, %K stays below 20,
  and buying every oversold reading is systematically long against the only move
  that matters. Shorter windows reach the outer marks sooner and fail sooner
  here.
- **The window is the claim.** "At the top" means top of the configured
  candles. Change the setting and the same chart produces a different reading.
  No setting is more correct than another.
- **%D trails %K by construction**, so a cross can be well underway before it
  prints.
- **A window with no movement has no value** and resolves as indeterminate,
  not as a number.

**Pairs with.** Range trading at established boundaries. With a market-structure
read that establishes the boundary first — otherwise it is guessing where the
range ends.

**On the chart.** Separate percentage axis, 0–100, two lines.

---

## williams_r

**What it measures.** The close's position within the configured range, scaled to
−100…0 instead of 0…100. Identical logic to `stochastic` with a shifted and
inverted scale, computed from high, low and close.

**How to read it.** 0 is the top of the window's range, −100 the bottom. The
outer marks at −20 and −80 are convention, not buy or sell signals. Reading
it as an oscillator in the family it belongs to, not as a separate idea — every
stochastic caveat applies unchanged.

**When it lies.** Everything `stochastic` does, for the same reasons.
**Specifically: do not present it as a second, independent opinion.** It is the
same calculation with a different scale, and treating two correlated readings as
two confirmations overstates the evidence — that is how a position gets sized as
though it had two reasons and only has one.
**A window with no movement has no value** and resolves as indeterminate,
not as a number.

**Pairs with.** Wherever `stochastic` fits. Choosing it over the other is a
display preference, not an analytical one.

**On the chart.** Separate percentage axis, −100…0.

---

## cci

**What it measures.** How far the typical price sits from its own moving
average, expressed in statistical units — so a reading of +200 is roughly two
standard deviations out. Typical price is the average of high, low and close,
and the configured period decides what "recent" means.

**How to read it.** ±100 is the statistically ordinary excursion. Beyond roughly
±200 the move is unusual relative to its own recent behaviour. Those are
conventions, not buy or sell signals. The sign of the reading tells you which
side is active.

**When it lies.**
- **The ±100 band assumes a stable distribution.** CCI assumes its own recent
  behaviour is representative. In a trending market the price spends most of its
  time outside ±100 — not because the move is unusual, but because "recent
  behaviour" no longer describes the market. Shorter periods cross the bands
  sooner and fail sooner here.
- **It is unbounded, unlike the family it is quoted with.** A move outside ±200
  is not a reversal signal and not an exhaustion signal; it means the scale
  assumption is violated.
- **Typical price averages away the wick.** On a candle where the rejection was
  entirely in high or low, CCI can read mild.
- **A window with no movement has no value** and resolves as indeterminate,
  not as a number.

**Pairs with.** Momentum entries after a genuine directional break, where the
question is "how strong is this, not how far has it gone".

**On the chart.** Separate unitless axis, centred on zero. Lines at ±100 and
±200 make the scale's assumption visible instead of hiding it.

---

## mfi

**What it measures.** The relative-strength calculation applied to the typical
price using volume as the weighting. It is RSI computed on a volume-weighted
price rather than on price alone, over the configured period.

**How to read it.** Same shape as RSI: above 50 leans toward buyers. That is a
tendency, not a signal. 80 and 20 are conventional outer marks, not buy or sell
signals. The addition over RSI is that a move with volume behind it
produces a more extreme reading than the same price move on thin volume — which
is the intended signal.

**When it lies.**
- **It is not a volume indicator.** It does not measure participation; it
  measures price change weighted by volume. A single enormous volume spike on a
  flat candle moves it without any price change at all.
- **It inherits every RSI failure** — the trend case above applies in full.
  Shorter periods reach the outer marks sooner and fail sooner in trends.
- **Volume is the input most likely to be wrong or absent.** On a thin or
  fragmented symbol the weighting is unreliable in ways that are not visible in
  the reading. This matters more here than for any price-only indicator.
- **A window with no money flow in either direction has no value** and resolves
  as indeterminate, not as a number.

**Pairs with.** Divergence work where volume confirmation is specifically
wanted.

**On the chart.** Separate percentage axis, 0–100.

---

## ao

**What it measures.** The difference between a fast and a slow moving
average of the median price, each a median rather than a mean. Rises when
short-term movement exceeds long-term, falls when it does not. The configured
periods decide what "short-term" and "long-term" mean.

**How to read it.** The zero line is the whole signal: above it, short-term
movement dominates. There are no useful fixed thresholds — unlike RSI, there is
no "70" that means anything, because the scale is in price units and moves with
the instrument. Compare the slope and the duration above or below the line.

**When it lies.**
- **It carries no scale.** A reading of +40 on one symbol and +4,000 on another
  mean the same thing proportionally and different things absolutely. Any
  threshold quoted without naming the instrument is meaningless.
- **It is structurally lagged.** Both inputs are smoothed, so turns in the
  underlying movement appear in the reading after they happened.
- **The median is not a mean.** Outlier resistance is the point, and it also
  means the reading describes typical candles rather than the extremes that
  moved price.
- **Before a full window of the slower period there is no value**, and the
  reading resolves as indeterminate, not as a number.

**Pairs with.** Confirming direction and relative strength on a higher timeframe
than the entry, where the question is which side is in control.

**On the chart.** Separate price-dimension axis below the price, zero line
emphasised.

---

## momentum

**What it measures.** The closing price against the closing price a configured
period back, as a difference. No averaging is involved at any stage.

**How to read it.** Sign is direction, magnitude is how much has been gained or
lost relative to the base. Because there is no smoothing, the reading is as fast
as the market. The most important reading is the slope, not the level: when the
line flattens while price still rises, acceleration is fading, and when it falls
toward the zero line, the intact trend is losing steepness. A cross of the zero
line only counts with the trend — upward only in an uptrend, downward only in a
downtrend.

**When it lies.**
- **It compares two prices a full period apart, so its scale drifts with price.**
  A reading of +500 means something different on every instrument and changes
  meaning over months on the same one. Quoting a level without context is
  meaningless here in a way it is not for a bounded oscillator.
- **It is not comparable across instruments**, unlike the bounded oscillators,
  which is what makes those convenient for alerts.
- **Without smoothing the comparison is extremely noisy.** The reading reflects
  one candle's move against another a period apart, which is often noise rather
  than information.

**Pairs with.** Fast directional reads where smoothing would be too slow,
usually on a higher timeframe than the one being traded.

**On the chart.** Separate price-dimension axis, zero line emphasised.

---

## Links

- [`README.md`](README.md) — what a card is and is not
- [`trend.md`](trend.md) — where these hand over to overlays on price
- FEAT-0677 — the Academy indicator category these cards feed
- `src/lib/alerts/indicatorCatalogue.ts` — parameters, defaults, outputs
