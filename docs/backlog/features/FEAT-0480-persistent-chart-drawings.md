---
id: FEAT-0480
title: Persistent, addressable chart drawings
type: feature
status: idea
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

- [ ] A horizontal line and a trend line can be drawn and survive a reload
- [ ] Every drawing has a stable id that survives a reload and a symbol switch
- [ ] A drawing can be selected, moved and deleted
- [ ] A drawing belongs to one symbol and does not appear under another
- [ ] The level of a sloped line can be read for an arbitrary timestamp, tested
      at two different times, without duplicating the chart's scale maths
- [ ] Drawings never leave the device

## Out of scope

- Channels, fibonacci tools, text and shape annotations — one more primitive
  each, once the layer holds
- Alerts on a drawing: that is [`FEAT-0029`](FEAT-0029-drawing-alerts.md), the
  item this one unblocks
- `CandlestickChart.svelte`, the chart.js component used elsewhere. Drawings
  live in the chart window until someone asks for them somewhere else

## Why this stays `idea`

Hit testing, dragging and pointer capture are interactive canvas work, the
category `AGENTS.md` keeps out of unattended sessions. `status: ready` is not a
neutral label here: `scripts/jules/dispatch-backlog.mjs` selects on it, so the
flip is the dispatch. Hand this over deliberately
(`scripts/jules/create-session.sh --file ...`) or build it in a session.

## Links

- [`FEAT-0029`](FEAT-0029-drawing-alerts.md) — the item waiting on this one
- `src/lib/windows/implementations/CandleChartView.svelte` — the chart window
