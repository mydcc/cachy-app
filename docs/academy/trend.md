# Cards: trend

Averages, and the signals built on top of them. Everything here sits **on the price
chart** rather than in a panel below it — which is the practical reason to use one:
the reading and the price it describes are in the same place, so a claim about one can
be checked against the other without moving your eyes.

The family answers "which side is in control". It does not answer "is it turning".

---

## Moving averages — ema, sma, wma, hma

*Covers four catalogue entries — `ema`, `sma`, `wma`, `hma` — in one card, because
they differ only in weighting and their failure modes are identical. Each still needs
its own lesson; the lesson text is what splits, not this card.*

**Misst.** The average of the price over the last N periods, drawn as a line. The four
differ only in how past prices are weighted:

- **SMA** — every period counts the same.
- **EMA** — recent periods count for more, so it turns sooner and is less stable.
- **WMA** — weights rise linearly towards the newest period. A compromise between the
  two above.
- **HMA** — built from the relationship between an EMA and a weighted moving average
  of the difference between them, which removes almost all of that difference's lag.
  Fastest of the four and the noisiest.

Computed over the default price, and an EMA can be pointed at a different price column
where that is meaningful.

**Liest man so.** Price above a rising average means buyers have been paying up
recently; below a falling one means the opposite. Slope matters more than level: a
flat average is not a trend statement in either direction. Distance from the average
is a measure of how extended price is, not of how likely it is to return.

**Lügt wenn.**
- **In a range, an average is a trend line drawn through noise.** Crosses fire
  repeatedly and each one says nothing. Every cross-based system needs the market to
  have a direction before its crosses mean anything.
- **Faster is not more informative.** HMA and short-period EMA produce more signals,
  and in a range that is strictly worse: more chances to be wrong, none of them more
  correct. The choice of variant is a bet on noise tolerance, not an accuracy ranking.
- **Crossing lag is real and one-directional.** Because the average is built from past
  prices, the cross happens after the move it confirms. A faster average crosses
  sooner and carries a higher false-cross rate — the trade is real, not free.
- **A long-period average on a short history is mostly fiction.** It exists, it draws,
  and it describes almost nothing about the regime.

**Passt zu.** Trend definition and dynamic support. Pairs with the regime question —
`adx` and `choppiness` below decide whether an average's crosses should be believed
at all.

**Chart.** Overlaid on the price, in the price dimension.

---

## vwma

**Misst.** The average of the price over N periods, weighted by volume rather than by
recency. The periods that traded heavily count for more.

**Liest man so.** Where the average sits against price, read as above — but the
average now reflects where trading actually happened, not just where price went.
Useful where volume concentrates: price chopping around a level while volume piles up
at one price is the situation this describes.

**Lügt wenn.**
- **One volume spike moves the line more than a week of price.** That is the intended
  behaviour and it is also the failure: a single block prints a price level that never
  traded meaningfully and the average follows it.
- **It inherits every moving-average failure**, plus sensitivity to volume data quality
  in a way a plain average does not have.
- **It is not a volume indicator and does not confirm anything by itself.** It is a
  price average with a different weighting.

**Passt zu.** Levels where volume concentration matters. Compared against an unweighted
average, not used instead of one.

**Chart.** Overlaid on the price, in the price dimension.

---

## macd

**Misst.** The difference between a fast and a slow exponential average, plus a signal
line (an average of that difference) and the histogram (the gap between the two).

**Liest man so.** The **sign of the macd line** says which side's average is higher —
direction. The **macd/signal cross** is the event most systems use. The **histogram**
says how fast that gap is opening or closing, which is a statement about the current
move rather than about direction.

**Lügt wenn.**
- **A shrinking histogram is not a reversal.** The most common misreading. The
  histogram shrinking means the two averages are converging, which happens in every
  trend when it pauses, and it says nothing about which way it resolves.
- **It lags more than the price does.** It is built from two averages, so it is later
  than either.
- **In a range, the macd line spends most of its time near zero**, where its sign is
  noise. Crosses there are the crossing of two lines that are both flat.
- **The histogram is derived, not an independent third reading.** It is the difference
  of the other two by definition, and reading all three as three signals counts one
  number twice.

**Passt zu.** Direction and momentum shifts on a higher timeframe than the entry.

**Chart.** Separate price-dimension axis below the price, three lines, zero line
emphasised.

---

## adx

**Misst.** Trend **strength**, in three parts: +DI and −DI are the directional
indicators and say which side is dominant; ADX says how strong that dominance is. It
carries no direction of its own. One period governs both the directional smoothing and
ADX's own window.

**Liest man so.** ADX above roughly 25 is conventionally read as trending, below 20 as
not. Read it as a **filter on the other two**: +DI above −DI with ADX high is a
directional read worth acting on; +DI above −DI with ADX low is not. The separation of
strength from direction is the whole design of this indicator.

**Lügt wenn.**
- **ADX is not directional and the temptation to read it that way is the main error.**
  A rising ADX says movement is intensifying, not that it is upward.
- **ADX is lagged by construction** — it is an average of an average. By the time it
  reads high, the move has been running for a while.
- **It can read high inside a range.** A violent two-way market produces directional
  movement on both sides, and the absolute movement ADX measures does not distinguish
  that from a trend.
- **The 20/25 thresholds are conventions, not properties.** They come from experience
  with particular instruments and periods, and nothing breaks if price disagrees with
  them.

**Passt zu.** Everything else in the trend family, as the filter that decides whether
to believe them. Used alone it is close to useless.

**Chart.** Separate percentage axis below the price, three lines: ADX, +DI, −DI.

---

## super_trend

**Misst.** A trailing band that follows price by a multiple of volatility. The price
standing above the band is the trend being read as up; the band the trend stands on
flips to the other side when price crosses it. Three lines: the band price is on, and
the two bands it could be on.

**Liest man so.** The flip is the event. `value` is the band the trend currently
stands on, not a price level in itself — while the trend holds, it moves with price.

**Lügt wenn.**
- **It whipsaws in a range.** Each flip is a real signal that is wrong. The factor
  setting controls how much volatility is required to flip, which is a direct dial on
  how many false flips a range produces.
- **The bands are not support.** They trail, so they move away from old price. Reading
  the band as a level price should hold is a category error.
- **It is volatility-derived and inherits that.** A volatility spike produces a wide
  band, and price can stay on the trend side of it while moving a long way — the
  reading can be "still uptrend" through a violent drop if the volatility justifies it.

**Passt zu.** Trailing trend exits and mechanical trend membership, on a timeframe
where the whipsaw rate is acceptable.

**Chart.** Overlaid on the price, in the price dimension.

---

## parabolic_sar

**Misst.** A single point that trails price on the side of the trend, accelerating as
the trend extends, and relocating to the other side when price crosses it. Three
parameters: start, increment and maximum.

**Liest man so.** The `value` line is the SAR point. **`direction` is not a price** — it
is the side the SAR stands on, +1 while it trails below price and −1 while it stands
above, so "the SAR flips" is `direction` crossing zero. That is exactly where it is
useful: the flip is the signal, and a close crossing the SAR itself can miss a
reversal on a candle that closes back across.

**Lügt wenn.**
- **It whipsaws in a range**, harder than super_trend, because there is no volatility
  filter in its design — only the accelerating step.
- **`direction` is the signal and reading it as a magnitude is meaningless.** It has
  two states.
- **Acceleration is the trap.** The SAR moves further from price the longer the trend
  runs, so its very reliability in a strong trend is what produces large whipsaw
  distances at the turn.
- **The first point is a seed, not a reading.** It appears only once a second candle
  exists.

**Passt zu.** Mechanical trailing stops in a trend, where accepting the whipsaw is the
accepted cost.

**Chart.** Overlaid on the price, points plus a direction line.

---

## ichimoku

**Misst.** Five lines. The **cloud** is drawn from two spans and projected forward;
**tenkan** (conversion line) and **kijun** (base line) are two averages of different
lengths. Price relative to the cloud is the trend statement; tenkan relative to kijun
is a shorter-term statement within it.

**Liest man so.** Above the cloud, above both spans — an uptrend with support defined
by the cloud's lower edge. Below it, the mirror image. Tenkan crossing kijun is the
timing signal inside the direction.

**Lügt wenn.**
- **Displacement is fixed, not a setting.** The spans are projected forward by a fixed
  amount, because the core computes it that way. A lesson or an alert that presents it
  as tunable is describing something that does not exist here.
- **The cloud is a lagging average, and visibly so.** It is built from averages and
  projected, so it trails the market by construction. It is a statement about where
  price was and how it would have behaved had the trend continued.
- **It needs far more history than the other trend indicators.** The longest span runs
  well past fifty periods; on a short history the cloud has no established shape and
  the reading is not interpretable.
- **Five lines on one chart is a lot to read at once**, and the reading most people
  take — above or below — uses one of them. The rest are refinement.

**Passt zu.** Multi-timeframe analysis where the higher timeframe is the reference and
the lower one is the entry, on instruments with enough history.

**Chart.** Overlaid on the price, in the price dimension, projected forward.

---

## Links

- [`README.md`](README.md) — what a card is and is not
- [`volatility.md`](volatility.md) — where the volatility input to super_trend lives
- [`oscillators.md`](oscillators.md) — the opposite family: bounded, mean-reverting
- FEAT-0677 — the Academy indicator category these cards feed
- `src/lib/alerts/indicatorCatalogue.ts` — parameters, defaults, outputs
- `technicals-wasm/src/rule/indicator.rs` — the authoritative registry