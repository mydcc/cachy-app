---
id: FEAT-0480
title: Persistent, addressable chart drawings
type: feature
status: done
assignee: claude
branch: feat/feat-0480-chart-drawings
priority: P2
milestone: M4
editions: [community, pro, private]
area: chart
data_class: A
adr: none
depends_on: []
size: L
estimate: 8
---


# FEAT-0480 — Persistent, addressable chart drawings

## Problem

Traders mark support, resistance and channels on the chart, and the marks are
gone on reload. Nothing can point at one either: a drawing is pixels on a
canvas, not an object with a name, so no other feature can refer to it.

[`FEAT-0029`](FEAT-0029-drawing-alerts.md) wants to hang an alert on such a
line and cannot, because there is nothing to hang it on. That item has carried
its own prerequisite in its body since it was filed — "requires persistent,
addressable drawing objects, which do not exist yet" — which left the blocker
invisible to every listing that reads front matter rather than prose.

## Proposal

A drawing layer in the chart window: the trader draws, the drawing persists,
and every drawing has a stable id that other features can reference.

**The charting approach is no longer open.** `CandleChartView.svelte` — the
chart window — runs `lightweight-charts` 5.2.1, and that version ships the
primitive API this needs: `ISeriesPrimitive`, `IPanePrimitive` and
`attachPrimitive` are all in the installed typings, and nothing in the repo
uses them yet. A drawing becomes a primitive attached to the candle series and
paints through the coordinate transforms the chart already owns, so the level
of a sloped line at a given time is the chart's own arithmetic rather than a
second implementation of it that drifts.

Storage follows every other trader artefact: Class A, `localStorage`, one store
(`cachy_drawings_v1`), never sent anywhere (`docs/adr/0001-local-first-boundary.md`).

## Acceptance criteria

- [x] A horizontal line and a trend line can be drawn and survive a reload
- [x] Every drawing has a stable id that survives a reload and a symbol switch
- [x] A drawing can be selected, moved and deleted
- [x] A drawing belongs to one symbol and does not appear under another
- [x] The level of a sloped line can be read for an arbitrary timestamp, tested
      at two different times, without duplicating the chart's scale maths
- [x] Drawings never leave the device

## Out of scope

- Channels, fibonacci tools, text and shape annotations — one more primitive
  each, once the layer holds
- Alerts on a drawing: that is [`FEAT-0029`](FEAT-0029-drawing-alerts.md), the
  item this one unblocks
- `CandlestickChart.svelte`, the chart.js component used elsewhere. Drawings
  live in the chart window until someone asks for them somewhere else

## How it was built (2026-09-18)

`levelAt()` in `src/lib/chart/drawings/levelAt.ts` is the single definition of
where a drawing sits at a timestamp. The renderer and FEAT-0029's alerts both
read it, so the line on screen cannot disagree with the threshold it stands
for.

Interpolation is linear in price, not in screen space. The rule engine
evaluates candles with no chart attached, and a level computed from pixels
would move the moment the trader toggled the logarithmic price scale — the
kind of unverifiable trigger the rule system refuses everywhere else. On a log
scale the drawn line therefore bows slightly; that is the honest picture of the
level that fires.

The criterion "without duplicating the chart's scale maths" is met by
construction rather than by care: `polylineFor()` samples the level at each
candle time and asks the chart for that price's pixel, so every scale question
goes back to the chart's own transform. The sample points are the timestamps an
alert evaluates, which makes the polyline's vertices exactly the points that
can trigger.

Drawing is a `lightweight-charts` series primitive (`attachPrimitive`), the
first use of that API in the repo. FEAT-0247's `createPriceLine` still owns
horizontal order lines; this primitive owns what `createPriceLine` cannot
express — anything with a slope.


## Links

- [`FEAT-0029`](FEAT-0029-drawing-alerts.md) — the item waiting on this one
- `src/lib/windows/implementations/CandleChartView.svelte` — the chart window
