# Cards: oscillators

Bounded, mean-reverting readings. The family where a plain threshold is the condition
a trader actually wants, and the family where the threshold is most often quoted as
if it were a law of nature.

Oscillators answer "how far has price moved from where it was" — not "where is price
going". That distinction is the source of nearly every failure below.

---

## rsi

**Misst.** Relative buying versus selling pressure, expressed as a percentage between
0 and 100. 50 is balance; the distance from 50 is the strength of one side. Computed
over the default price, so it can be pointed at another candle column where that is
meaningful.

**Liest man so.** Above 50 favours buyers, below 50 favours sellers. 70 and 30 mark the
outer band where the move is stretched relative to recent history. The useful reading
is usually not the level but the *shape*: higher highs in price with lower highs in
RSI is a divergence, and a divergence only means something where a reversal is
plausible at all.

**Lügt wenn.**
- **In a trending market.** RSI stays above 70 or below 30 for as long as the trend
  lasts. In a strong uptrend it prints overbought on nearly every candle, and treating
  that as a sell signal produces a series of small losses against a large move.
- **Divergence inside a range.** Two highs in a sideways market where price oscillates
  between the same levels produce divergence constantly. Divergence is a statement
  about momentum failing, and in a range there is no momentum to fail.
- **Against a level that is itself the point.** "Overbought" means stretched against
  recent history, not expensive in absolute terms. A price that reached a new high is
  by definition not stretched in the way the reading claims.

**Passt zu.** Reversal setups at range boundaries, taken with a defined stop beyond
the level. Trend continuation is not its job — that is where an overlay on the price
itself (see `trend.md`) carries the signal instead.

**Chart.** Separate percentage axis below the price, fixed 0–100.

---

## stoch_rsi

**Misst.** The stochastic of the RSI. Applies the stochastic's position-within-range
logic to RSI values rather than to price.

**Liest man so.** %K and %D, both 0–100, reading where RSI currently sits within its
own recent range. Crosses of %K over %D are the usual event.

**Lügt wenn.**
- **Double smoothing hides the thing you wanted to see.** A stochastic of a
  stochastic reaches its extremes far more often than the underlying RSI does, so
  readings that would be rare on the RSI are routine here.
- **Inherited every RSI failure, then some.** Whatever made the RSI misleading in a
  trend makes this misleading in a trend, and the extra transform removes the absolute
  level information that would have told you which regime you are in.
- **Its range is RSI-relative, not price-relative.** "At the top of its range" refers
  to where RSI is, not to where price is. A strongly rising price can sit at a low
  stochastic if RSI has been rising even faster.

**Passt zu.** Very short mean-reversion entries in genuinely quiet conditions. It is a
precision tool for a narrow case, not a general-purpose oscillator.

**Chart.** Separate percentage axis, 0–100, two lines.

---

## stochastic

**Misst.** Where the close sits within the highest high and lowest low of the recent
window. %K is that position smoothed, %D is a moving average of %K.

**Liest man so.** %K above 80 means the close is near the top of the last window's
range. %K crossing %D is the event most systems are built on. Reading it as "the
market is nearly finished rising" is reading it as a statement about the window, which
is what it is.

**Lügt wenn.**
- **In any trend, permanently.** This is the defining failure. In a sustained uptrend
  the close keeps printing near the window high and %K pins above 80 for the length of
  the trend. A rule that sells every overbought print in a trend is systematically
  short the only move that matters.
- **The window is the claim.** "At the top" means top of the last N candles. Change N
  and the same chart produces a different reading. No setting is more correct than
  another; all of them are true of their own window.
- **%D lags %K by construction**, so a cross can be well underway before it prints.

**Passt zu.** Range trading at established boundaries. With a market-structure read
that establishes the boundary first — otherwise it is guessing where the range ends.

**Chart.** Separate percentage axis, 0–100, two lines.

---

## williams_r

**Misst.** The close's position within the recent range, scaled to −100…0 instead of
0…100. Identical logic to `stochastic` with a shifted and inverted scale.

**Liest man so.** 0 is the top of the window's range, −100 the bottom. Reading it as an
oscillator in the family it belongs to, not as a separate idea — every stochastic
caveat applies unchanged.

**Lügt wenn.** Everything `stochastic` does, for the same reasons. **Specifically: do
not present it as a second, independent opinion.** It is the same calculation with a
different scale, and treating two correlated readings as two confirmations
overstates the evidence — that is how a position gets sized as though it had two
reasons and only has one.

**Passt zu.** Wherever `stochastic` fits. Choosing it over the other is a display
preference, not an analytical one.

**Chart.** Separate percentage axis, −100…0.

---

## cci

**Misst.** How far the typical price sits from its own moving average, expressed in
statistical units — so a reading of +200 is roughly two standard deviations out.
Typical price is the average of high, low and close unless another price is named.

**Liest man so.** ±100 is the statistically ordinary excursion. Beyond roughly ±200
the move is unusual relative to its own recent behaviour. The direction of the reading
tells you which side buyers or sellers are on.

**Lügt wenn.**
- **The ±100 band assumes a stable distribution.** CCI assumes its own recent
  behaviour is representative. In a trending market the price spends most of its time
  outside ±100 — not because the move is unusual, but because "recent behaviour" no
  longer describes the market.
- **It is unbounded, unlike the family it is quoted with.** A move outside ±200 is not
  a reversal signal and not an exhaustion signal; it means the scale assumption is
  violated.
- **Typical price averages away the wick.** On a candle where the rejection was
  entirely in high or low, CCI can read mild.

**Passt zu.** Momentum entries after a genuine directional break, where the question is
"how strong is this, not how far has it gone".

**Chart.** Separate unitless axis, centred on zero. Lines at ±100 and ±200 make the
scale's assumption visible instead of hiding it.

---

## mfi

**Misst.** The relative-strength calculation applied to the typical price using volume
as the weighting. It is RSI computed on a volume-confirmed price rather than on price
alone.

**Liest man so.** Same shape as RSI: above 50 favours buyers, 80 and 20 mark the outer
band. The addition over RSI is that a move with volume behind it produces a more
extreme reading than the same price move on thin volume — which is the intended
signal.

**Lügt wenn.**
- **It is not a volume indicator.** It does not measure participation; it measures
  price change weighted by volume. A single enormous volume spike on a flat candle
  moves it without any price change at all.
- **It inherits every RSI failure** — the trend case above applies in full.
- **Volume is the input most likely to be wrong or absent.** On a thin or fragmented
  symbol the weighting is unreliable in ways that are not visible in the reading. This
  matters more here than for any price-only indicator.

**Passt zu.** Divergence work where volume confirmation is specifically wanted.

**Chart.** Separate percentage axis, 0–100.

---

## ao

**Misst.** The difference between a 5-period and a 34-period moving average of the
median price, each a median rather than a mean. Rises when short-term movement exceeds
long-term, falls when it does not.

**Liest man so.** The zero line is the whole signal: above it, short-term movement
dominates. There are no useful fixed thresholds — unlike RSI, there is no "70" that
means anything, because the scale is in price units and moves with the instrument.
Compare the slope and the duration above or below the line.

**Lügt wenn.**
- **It carries no scale.** A reading of +40 on one symbol and +4,000 on another mean
  the same thing proportionally and different things absolutely. Any threshold quoted
  in a lesson without naming the instrument is meaningless.
- **It is structurally lagged.** Both inputs are smoothed, so turns in the underlying
  movement appear in the reading after they happened.
- **The median is not a mean.** Outlier resistance is the point, and it also means the
  reading describes typical candles rather than the extremes that moved price.

**Passt zu.** Confirming direction and relative strength on a higher timeframe than
the entry, where the question is which side is in control.

**Chart.** Separate price-dimension axis below the price, zero line emphasised.

---

## momentum

**Misst.** The current price against the price a full period back, as a difference.
No averaging is involved at any stage.

**Liest man so.** Sign is direction, magnitude is how much has been gained or lost
relative to the base. Because there is no smoothing, the reading is as fast as the
market.

**Lügt wenn.**
- **It is a raw difference, so its scale drifts with price.** A reading of +500 means
  something different on every instrument and changes meaning over months on the same
  one. Quoting a level without context is meaningless here in a way it is not for a
  bounded oscillator.
- **It is not comparable across instruments**, unlike the bounded oscillators, which
  is what makes those convenient for alerts.
- **A single-period comparison is extremely noisy.** Without smoothing the reading
  reflects one candle's move against another, which is often noise.

**Passt zu.** Fast directional reads where smoothing would be too slow, usually on a
higher timeframe than the one being traded.

**Chart.** Separate price-dimension axis, zero line emphasised.

---

## Links

- [`README.md`](README.md) — what a card is and is not
- [`trend.md`](trend.md) — where these hand over to overlays on price
- FEAT-0677 — the Academy indicator category these cards feed
- `src/lib/alerts/indicatorCatalogue.ts` — parameters, defaults, outputs