---
id: BUG-0453
title: An alert armed from an indicator card ignores the card's price source
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: none
adr: none
depends_on: []
---

# BUG-0453 — An alert armed from an indicator card ignores the card's price source

## Symptom

The RSI, CCI, Momentum and EMA settings cards have a **Source** selector — `close`,
`open`, `high`, `low`, `hl2`, `hlc3` (`IndicatorSettings.svelte`). The chart honours it:
`indicatorLayer.ts` computes each of those panes over `getSourceData(rows,
this.src(s.<card>.source))`.

The card's create-alert action does not. `indicatorSettingsSeed.ts` maps a card to rule
parameters — period, fast/slow periods, factors — and never reads `source`, and the core
registry has no source parameter to carry it. `computeIndicatorSeries` always computes
over the close. So a trader who has RSI(14) on `hl2` on the chart and arms an alert from
that card gets an alert on RSI(14) of the **close**: a different line from the one they
are looking at, with nothing on screen saying so.

Not hypothetical for long: the CCI card **defaults** to `hlc3`, so wiring CCI into the
alert path (FEAT-0446 group 2) as things stand would make the *default* case diverge.

## Evidence

**Read from the code, not yet reproduced in a test.**

- `src/stores/indicator.svelte.ts` — `source` defaults: `close` for RSI, Stoch RSI, MACD,
  Momentum, EMA and Bollinger; `hlc3` for CCI
- `src/components/settings/tabs/IndicatorSettings.svelte` — selectors for RSI, CCI,
  Momentum and EMA
- `src/lib/alerts/indicatorSettingsSeed.ts` — no reference to `source`
- `technicals-wasm/src/rule/indicator.rs` — no `source` parameter on any indicator

The WASM Technicals calculator has the same gap (`wasmCalculator.ts` passes no source), so
the panel's numbers and the chart's disagree there too; see
[`BUG-0452`](BUG-0452-wasm-momentum-off-by-one.md) "Out of scope".

## Options

| | What | Cost | Risk |
|---|---|---|---|
| A — contain | a card whose source is not `close` offers no alert action, and says why | small, JS only | none on firing; a trader on `hl2` loses the shortcut until B |
| B — carry it | add an optional `source` parameter to the registry for the indicators that have one, honour it in `computeIndicatorSeries` and the seed | core schema change, WASM rebuild, hash review | correct, but a larger change on a money path |

Recommended: **A now, B as its own item.** A closes the silent divergence in one small
change and is reversible; B is the real capability and deserves its own review.

## Acceptance criteria

- [ ] A test arms an alert from an RSI card set to `hl2` and fails today because the alert
      is computed on the close
- [ ] No card offers an alert whose computation differs from the chart line it came from
- [ ] FEAT-0446 group 2 does not wire `cci` in before this is resolved

## Links

- `src/lib/alerts/indicatorSettingsSeed.ts` — the card-to-rule mapping
- `src/lib/chart/indicatorLayer.ts` — where the chart reads `source`
- [`FEAT-0446`](../features/FEAT-0446-recorded-history-remaining-indicators.md) — group 2 waits on this for CCI
