---
id: FEAT-0395
title: Create an alert from the chart and from indicator settings
type: feature
status: in-progress
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0389, FEAT-0390, FEAT-0028]
size: S
assignee: claude-code
branch: worktree-super-alert-system-8498ff
estimate: 3
---

# FEAT-0395 — Create an alert from the chart and from indicator settings

## Problem

Arming an alert means opening a panel, typing a symbol that is already on screen, and
typing a price the trader just pointed at. The information the alarm needs is already
under the cursor, and the UI asks for it again.

## Proposal

Two entry points that pre-fill what is already known:

**Chart.** Right-click on the price scale or a candle → "Alert here", opening the Price
tab with the symbol and the clicked price filled in. One further click arms it.

**Indicator settings.** In `IndicatorCard.svelte` / `IndicatorSettings.svelte`, an
"Alert on this indicator" action that carries the *configured* parameters into
`IndicatorRef.params`. A trader who set RSI to 21 should not get an alarm on RSI 14 —
the parameters they are looking at are the ones they mean.

Both land in the panel from `FEAT-0389` with a pre-filled draft; neither arms anything
by itself. The plain-language sentence is still shown and still has to be confirmed.

## State (checked against the tree, 2026-09-12)

Partially shipped. The chart half landed as
`37a75cfd feat(alerts): create a price alert from the chart (FEAT-0395) (#2935)`.
The indicator half — "Alert on this indicator" in indicator settings — has no
implementation in `src/components/` yet.

The item carried a claim (`assignee: claude`, branch
`worktree-feat-0395-dependencies-resolved-edf8ae`) after that merge. The branch
exists neither locally nor on the remote and the worktree is gone, so the claim
was released back to `ready` rather than left to block the item. The acceptance
criteria are deliberately still unchecked: the chart entry point needs its
criteria verified against the merged code before any of them is ticked.

Remaining scope: the indicator entry point, plus verification of the four
shared criteria (no arming without confirmation, draft editable before arming,
keyboard reachable, both locales) for the chart path that already shipped.

## Acceptance criteria

- [x] Right-click on the price scale opens the Price tab with symbol and price pre-filled
      from the click position
- [x] "Alert on this indicator" carries the indicator's configured parameters, not defaults
- [x] Neither entry point arms a rule without an explicit confirmation
- [x] The pre-filled draft is editable before arming
- [x] Both entry points are keyboard reachable
- [x] German and English strings

## Out of scope

- Alerts on drawings — [`FEAT-0029`](FEAT-0029-drawing-alerts.md) owns that. This item
  covers price and indicator entry points only.

## State (2026-09-10)

**Chart entry point: done** — right-click on the price scale or a candle opens
the Price tab with the clicked level pre-filled; `ContextMenu` / `Shift+F10`
reach the same menu on the last price. The seed writes the rule document
(`alertPanelState.seed()` / `openFor()`), and the Price tab now reads its form
back out of the draft, so a right-clicked and a typed alarm are one document.
Covered by `src/lib/alerts/*.test.ts`, `alertPanel.seed.test.ts` and the
FEAT-0395 blocks in `CandleChartView.component.test.ts` / `PriceTab.component.test.ts`.

**Indicator entry point: blocked on [`FEAT-0028`](FEAT-0028-indicator-alerts.md).**
`IndicatorsTab.svelte` is still the FEAT-0389 placeholder, so "Alert on this
indicator" has no builder to pre-fill and no way to satisfy "the pre-filled
draft is editable before arming". Shipping the action against a placeholder
would put a dead end behind a button. `depends_on` gained FEAT-0028 for that
reason — the original list was incomplete rather than resolved.

What the second half still needs, once FEAT-0028 lands: a mapping from the
panel's indicator settings (`src/stores/indicator.svelte.ts`, camelCase keys
such as `rsi.length`) to the core's registry identities and parameter names
(`technicals-wasm/src/rule/indicator.rs`, snake_case `rsi`/`period`), an
`IndicatorRef[]` seed channel beside the condition (EMA and SMA carry three
configured lines, so one card is not one ref), and a test that runs every entry
of that mapping through `validate()` so a wrong parameter name cannot ship.

## Links

- [`FEAT-0029`](FEAT-0029-drawing-alerts.md) — the neighbouring entry point
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md), [`FEAT-0390`](FEAT-0390-price-alert-conditions.md)
- `src/components/settings/tabs/IndicatorCard.svelte`

## State (2026-09-11)

**The blocker is lifted.** `IndicatorsTab.svelte` is a real builder as of
FEAT-0028, so "Alert on this indicator" now has somewhere to land and a
pre-filled draft can be edited before arming.

What the second half still needs is unchanged in substance and shorter by one
item: the mapping from the panel's indicator settings
(`src/stores/indicator.svelte.ts`, camelCase `rsi.length`) to the core's
identities (`rsi`/`period`), and the `IndicatorRef[]` seed channel for cards
that carry several configured lines. The test that runs every entry of that
mapping through `validate()` now has a sibling to copy:
`indicatorCatalogue.test.ts` does exactly that for the catalogue's defaults.

## Progress (2026-09-12) — the indicator entry point

**Both halves are now built.** `IndicatorAlertAction.svelte` puts "Alert on
this indicator" on the settings card the trader is reading; it seeds the
Indicators tab with the indicator they configured and opens the panel, which
still asks for its own arm press.

**The mapping is held to both lists by a mechanism, not by discipline.**
`src/lib/alerts/indicatorSettingsSeed.ts` is the single translation between the
panel's camelCase settings (`rsi.length`, `bollingerBands.stdDev`) and the
core's registry identities (`rsi`/`period`, `bollinger`/`std_dev`), and it is
pinned in both directions by `indicatorSettingsSeed.test.ts` (66 tests):

- **Downwards**, every mapping becomes a real document handed to
  `rule_validate` from the committed WASM artefact.
- **Upwards**, every card is read off `indicatorState` itself, so a renamed
  panel key fails CI.

That second half is not redundant, and finding out why changed the test.
`refFor` walks the *registry's* parameter list and looks a reader up by the
core's own name, so a mapping key the core never declares is simply never
consulted: the registry default takes over, the document stays valid, and
`rule_validate` has nothing to say. The alarm just runs on a period the trader
did not choose. Only comparing the *declared* names against the registry sees
it, which is what `mappingLines()` exists for. Three reverts were checked:
misspelling a core parameter, misspelling a panel key, and dropping the
`Decimal` conversion each fail by name.

**Which cards get a button is derived, not placed.** 27 of the 28 cards pass
their store key to `IndicatorCard` (the plain Volume card has no parameters, so
it passes none); `isAlertableIndicator` decides whether an action renders.
Pivots, VWAP, Volume Profile and the ATR trailing stop have no registry
identity, so even where a key is passed no button appears rather than a button
onto nothing — and an indicator that gains a mapping gains its button without a
second edit.

### Two decisions worth naming

- **Copying, not inheriting.** `IndicatorRef.params` documents that a rule
  never inherits panel settings, and that still holds: the parameters are read
  once, at the press, into the draft. Retuning RSI in settings afterwards does
  not retune an armed alert. Pinned by
  `copies the parameters instead of tracking the panel`.
- **The threshold is not guessed.** The seed fills in the indicator and its
  parameters — which are on the trader's screen — and leaves `> 0`, the tab's
  own default. RSI 70 would have been the plausible-looking default, and a
  plausible default is what gets armed unread (ADR-0012 decision 5).

### Parameters the core cannot carry

`IndicatorRef.params` only carries what the registry (`indicator.rs`) declares,
so trader-facing settings with no core counterpart are not seeded: the sources
(`rsi`/`ema`/`macd`/`stochRsi`/`momentum`/`bollingerBands`), `volumeMa.maType`,
`cci.smoothingLength`/`threshold`, `ichimoku.displacement` and
`obv.smoothingLength`, alongside the already-commented ADX `diLength`. The
consequence is visible in the alert, not the panel: a trader who set EMA on
`hl2` gets an alarm on EMA of close. The core documents "no source in v1", and
the card carries no hint that only the period travels — left for a follow-up
rather than implied by a button that cannot deliver it.

### Deviation from the plan above

The earlier note called for an `IndicatorRef[]` seed channel *beside* the
condition. There is no second channel: the seed carries a `Condition` and the
tab reads its form back out of the draft, which is the round-trip BUG-0443
established, and adding a parallel channel would have given the tab two
sources for one fact. A multi-line card (EMA, SMA) still produces one ref per
line — `indicatorRefsFrom` returns all three and the condition seeds on the
first — so the array exists where the mapping needs it, without a second way
into the panel. Offering a *choice* between the three lines needs picker UI in
the tab and is not in this change.

### Chart half: verified rather than assumed

The four shared criteria were unchecked because the merged chart path had
never been held against them. It was, and it meets them: `ContextMenu` and
`Shift+F10` both open the menu (`CandleChartView.component.test.ts`, 31 tests,
two of them named for the keyboard), all three `chartView.alert.*` keys are in
both locale files, `openAlertPanelWith` seeds and opens without ever reaching
`armRule`, and the Price tab reads its form out of the draft so the level can
be edited before arming.

### Not covered

The action is exercised in `happy-dom`, not a browser, so the button's
placement in the card header is asserted structurally rather than visually.
