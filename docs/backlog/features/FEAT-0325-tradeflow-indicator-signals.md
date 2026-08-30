---
id: FEAT-0325
title: Drive the Trade Flow background from ATR and RSI, not only from trades
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0323]
assignee: none
branch: none
shipped: PR #2391 (develop 2026-08-29, follow-ups 134dc4a4 c662c197)
---

# FEAT-0325 — Drive the Trade Flow background from ATR and RSI, not only from trades

## Problem

Every Trade Flow mode reacts to individual trades and to nothing else. Two of
the scene-wide channels it derives from that stream are worse than the numbers
the app already computes:

- **Amplitude.** `tradeFlow.worker.ts` estimates volatility itself, as the
  standard deviation of the last ~100 trade prints divided by their mean
  (`relativePriceVolatility()`). That is a hand-rolled, window-dependent
  stand-in for ATR, which the technicals pipeline already calculates properly.
- **Mood.** The buy/sell tint comes from the ratio of the last 100 trades — a
  view of the last few seconds, presented as if it were the market's mood.

Meanwhile a user who wants a longer view has no way to ask for one.

## Proposal

Feed the two scene-wide channels from real indicators, and let the user pick the
source for each. Trades are events; ATR and RSI are states — so they drive
properties of the *space*, never individual particles, and never compete with
the volume channel.

- **`volatilitySource: "atr" | "trades"`** (default `atr`) — ATR of the chosen
  candle interval, divided by price. That quotient is exactly the `volatilityRel`
  that `marketHeat()` already expects, so the real indicator drops into the slot
  the estimate used to fill without touching the heat formula.
- **`moodSource: "sentiment" | "rsi"`** (default `sentiment`) — RSI is an added
  choice, not a replacement. Linear around the neutral 50, so 70 and 90 stay
  visually distinguishable instead of both saturating.
- **`indicatorTimeframe`** (default `15m`) — the candle interval both are read
  from.
- **`galaxyFlow.atrBands`** (default on, galaxy mode only) — three reference
  rings on the radial price axis: the last traded price and ±1 ATR around it.
  This is what turns the axis from something sensed into something read — a
  shockwave inside the rings is ordinary, one outside them is a breakout. The
  rings are placed through the same normaliser and the same
  `pow(ratio, concentrationPower) * radius` curve the vertex shader uses, so a
  ring and a wave born at one price land on one circle.

Both sources fall back to the trade-derived signal whenever no indicator value
exists, so the background never freezes while indicators are still loading or on
a symbol with no kline history.

Values are **read** from `marketState.data[symbol].technicals[timeframe]`; the
background never writes into shared market state. It subscribes via
`activeTechnicalsManager.register()`, which is ref-counted — when a chart is
already open on the same symbol and interval this costs a counter increment and
nothing else — and only while a setting actually consumes an indicator.

## Acceptance criteria

- [ ] With `volatilitySource: "atr"`, fog/light/nebula/galaxy-spin respond to the
      real ATR rather than to the trade-print spread.
- [ ] ATR is normalised by price, so the same relative volatility looks the same
      on BTC and on a sub-dollar alt.
- [ ] With `moodSource: "rsi"`, the buy/sell tint follows RSI; with
      `"sentiment"` the previous trade-ratio behaviour is unchanged.
- [ ] Both fall back to the trade-derived signal when the indicator is absent.
- [ ] The technicals subscription is registered only while an indicator is
      actually consumed, and unregistered on cleanup and symbol change.
- [ ] Indicator values are cleared on symbol change, like the volume window.
- [ ] The background performs no writes to `marketState`.
- [ ] An ATR ring sits on exactly the circle the vertex shader draws that price
      at, including under a non-linear `concentrationPower`.
- [ ] The rings tilt with the disc's own rotation, hide when the price axis or
      ATR is unavailable, and are cleared on symbol change.
- [ ] New UI strings exist in both `de.json` and `en.json`.
- [ ] `npm run check` clean; the pure mappings have unit tests.

## Out of scope

- Any indicator beyond ATR and RSI.
- Numeric labels on the ATR rings. The rings answer "inside or outside the
  normal range"; putting prices on them turns a background into a chart.
- Changing `marketHeat()`'s weighting. ATR enters through the existing
  `volatilityRel` input precisely so the formula stays put.

## Open questions

- `volatilitySource` defaults to `atr`, which means a Trade Flow background on a
  symbol with no open chart will start a technicals calculation it would not
  otherwise run. Ref-counting makes the common case free, but whether the
  default should be the cheaper `trades` is a product call.

## Links

- `src/components/shared/backgrounds/indicatorSignal.ts` (new)
- `src/components/shared/backgrounds/tradeFlow.worker.ts` (`computeActivity`)
- `src/components/shared/backgrounds/engines/volumeScale.ts` (`marketHeat`)
- `src/services/activeTechnicalsManager.svelte.ts`
- [FEAT-0323](FEAT-0323-galaxy-tradeflow-mode.md)
