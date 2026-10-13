# Cards: volatility

Three indicators, and the most common misreading in this category is simple:
**none of them says which way.** Each measures how much price moved, or how
orderly it moved. A lesson that presents any of these as directional is wrong at
the foundation.

This is the family that decides whether trend-following signals should be
believed at all, which makes it more load-bearing than its size suggests.

---

## bollinger

**What it measures.** A moving average of price with two bands a number of
standard deviations above and below it. Five outputs: the three prices, **%B**
(where price sits within the band span, 0 at the lower band and 1 at the upper),
and **bandwidth** (the band width as a percentage of the middle band).

**How to read it.**
- **Price riding the upper band in a trend** is continuation, not exhaustion.
  This is the single most consequential reading in the family and the most often
  taught backwards.
- **A close beyond the band with the trend flattening** is a genuine warning,
  and distinct from the above only by what the trend is doing.
- **Bandwidth at its lowest** is a compression, and the direction it resolves in
  is unknowable from this reading. It marks that a move is coming, not which
  way.
- **%B** answers "where inside the envelope", which is useful where the envelope
  matters — a close below 0 with a rising lower band is a different situation
  from a close below 0 in a falling market.

**When it lies.**
- **`bandwidth` is scaled by 100 and shown as a percentage — this is the one
  that causes real losses.** A reading of `2.41` means 2.41 **percent**, not the
  ratio 0.0241 that is the common convention elsewhere. A condition written as
  `bandwidth < 2.41` on the bare-ratio convention is true on essentially every
  candle and fires constantly. Anyone comparing this reading against a chart or
  an external reference has to check which scale they are looking at before
  comparing them at all.
- **Touching a band is not a signal.** In a trend price touches bands
  continuously and stays there. Bands describe the envelope of recent variation,
  not boundaries.
- **The bands are not statistically universal.** Two standard deviations is a
  parameter, and a wider setting widens the envelope without making it more
  correct.
- **%B is undefined when the band width is zero**, which is a real condition in
  a completely flat stretch — it resolves as indeterminate rather than as a
  number.
- **Compression resolves in a direction this cannot tell you.** Presenting
  bandwidth as a setup is presenting half of one.

**Pairs with.** Defining a range to trade, and reading expansion. The regime
filter for `trend.md`: a squeeze says trend-following signals are not yet worth
acting on.

**On the chart.** Overlaid on the price, band fill plus a middle line.

---

## atr

**What it measures.** The average true range — the average size of a period's
movement including gaps, over N periods. It measures magnitude of movement, not
direction, and carries no sign.

**How to read it.** ATR read against price tells you how far the instrument
normally travels in a period. That number is a **distance budget**: a stop
narrower than it is likely to be hit by ordinary movement, a target that is a
large multiple of it is ambitious. Read as a percentage of price, it compares
instruments that trade at different scales.

**When it lies.**
- **It is not directional and cannot forecast.** A high ATR is not "the market
  will fall". It is not even a claim about the market at all — only about its
  movement.
- **Absolute, not relative.** A raw ATR of 500 is unremarkable on one instrument
  and enormous on another, and it grows with price level over months. Comparing
  the raw reading across instruments, or across time on one instrument, compares
  nothing.
- **It rises after the move.** By the time volatility is high, it is high
  because something happened. Used as a prediction it is a lagging statement.
- **It spikes on gaps and shocks**, and stays elevated after the shock is over,
  so it temporarily overstates the normal range.

**Pairs with.** Stop placement and position sizing — which is why it matters
that the product computes it. Also as the volatility input that makes
`super_trend` in `trend.md` adaptive.

**On the chart.** Separate price-dimension axis below the price, single line.

---

## choppiness

**What it measures.** A single number between roughly 0 and 100 summarising how
orderly the movement is. Near 100 the market has been moving within a narrow,
directionless band; near 0 it has been moving decisively in one direction.

**How to read it.** As a **regime filter, and nothing else.** Above the middle
range: range behaviour, where breakouts fail and oscillator extremes mean
something. Below it: trending, where the indicators in `oscillators.md` are
unreliable and the overlays in `trend.md` are the ones worth reading.

**When it lies.**
- **It is not directional.** Same foundational point as ATR, and the same
  mistake: a reading at 90 says the market is not trending, not that it will go
  down.
- **Around the middle it is noise.** The useful information is at the extremes.
  A rule that fires on a mid-range reading is acting on the part of the scale
  that carries nothing.
- **It is calculated over a window and lags**, so the regime it describes has
  often already been left behind by the time it confirms.
- **It classifies movement, not the trader's opportunity.** A high reading means
  trend-following is not indicated; it does not mean range-trading is.

**Pairs with.** Gating the other cards. Used as a precondition on a signal
rather than as a signal itself.

**On the chart.** Separate percentage axis, 0–100.

---

## Links

- [`README.md`](README.md) — what a card is and is not
- [`trend.md`](trend.md) — the family choppiness filters, and super_trend's
  input
- [`oscillators.md`](oscillators.md) — unreliable in the trending regime
  choppiness identifies
- FEAT-0677 — the Academy indicator category these cards feed
- `src/lib/alerts/indicatorCatalogue.ts` — parameters, defaults, outputs
- `technicals-wasm/src/rule/indicator.rs` — the authoritative registry
