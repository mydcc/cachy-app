---
id: FEAT-0395
title: Create an alert from the chart and from indicator settings
type: feature
status: specced
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0389, FEAT-0390]
size: S
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

## Acceptance criteria

- [ ] Right-click on the price scale opens the Price tab with symbol and price pre-filled
      from the click position
- [ ] "Alert on this indicator" carries the indicator's configured parameters, not defaults
- [ ] Neither entry point arms a rule without an explicit confirmation
- [ ] The pre-filled draft is editable before arming
- [ ] Both entry points are keyboard reachable
- [ ] German and English strings

## Out of scope

- Alerts on drawings — [`FEAT-0029`](FEAT-0029-drawing-alerts.md) owns that. This item
  covers price and indicator entry points only.

## Links

- [`FEAT-0029`](FEAT-0029-drawing-alerts.md) — the neighbouring entry point
- [`FEAT-0389`](FEAT-0389-super-alert-panel.md), [`FEAT-0390`](FEAT-0390-price-alert-conditions.md)
- `src/components/settings/tabs/IndicatorCard.svelte`
