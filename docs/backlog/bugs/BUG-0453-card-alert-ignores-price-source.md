---
id: BUG-0453
title: An alert armed from an indicator card ignores the card's price source
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: none
adr: none
depends_on: []
assignee: claude-code
branch: fix/bug-0453-card-alert-source
start_date: 2026-09-13
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

**Read from the code, then reproduced in tests** (see Acceptance criteria).

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

## Decided and done: A (2026-09-13)

- `cardAlertAvailability(key, card)` in `indicatorSettingsSeed.ts` answers `armable`,
  `not-alertable` or `source-not-close`. A falsy source (`undefined`, `null`, `""`, `0`,
  `false`) is the close, matching the chart's own `src()` fallback; any other value,
  including one the module does not recognise, is not.
- `indicatorRefsFrom` asks `cardAlertAvailability` before it builds refs, so the seed is
  `null` through the same decision the button uses — they cannot disagree.
- `IndicatorAlertAction.svelte` keeps the button on such a card with `aria-disabled`,
  dimmed, and names the reason as its label and tooltip
  (`settings.technicals.alertSourceNotClose`, both locales). It stays focusable, so the
  reason is reachable by keyboard, and pressing it opens nothing.
- It is generic over the card's `source` field, not a list of cards: MACD, Stoch RSI and
  Bollinger carry a stored source without a selector, and are covered by the same rule.
  Bollinger's chart line now honours that stored source too (`indicatorLayer.ts`), so a
  hand-edited non-close value draws the line it names and the rule refuses it — the chart
  and the rule agree instead of the chart silently drawing the close.

Not changed: alerts already armed from such a card before this keep computing over the
close. Their documents carry no source, so there is nothing to tell them apart by.

B is [`FEAT-0454`](../features/FEAT-0454-alert-on-indicator-price-source.md).

## Acceptance criteria

- [x] A test seeds from an RSI card set to `hl2` and failed before the fix (`indicatorSettingsSeed.test.ts`, "a card whose price source the alert
      path does not compute over", over every armable card that carries a source)
- [x] No card offers an alert whose computation differs from the chart line it came from
      (the button refuses and names the reason: `IndicatorAlertAction.component.test.ts`)
- [x] FEAT-0446 group 2 does not wire `cci` in before this is resolved — resolved here;
      with the default `hlc3` the CCI card will refuse until FEAT-0454

## Links

- `src/lib/alerts/indicatorSettingsSeed.ts` — the card-to-rule mapping
- `src/lib/chart/indicatorLayer.ts` — where the chart reads `source`
- [`FEAT-0446`](../features/FEAT-0446-recorded-history-remaining-indicators.md) — group 2 waits on this for CCI
