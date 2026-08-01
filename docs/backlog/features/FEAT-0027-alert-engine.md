---
id: FEAT-0027
title: A local alert engine with price alerts
type: feature
status: specced
priority: P1
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# FEAT-0027 — A local alert engine with price alerts

## Problem

There is no way to be told when a price reaches a level. A trader watching four
symbols watches them manually.

## Proposal

An evaluation engine running against the existing live feed, plus the first
condition type: price alerts (level reached, crossing up or down, percentage
move over a window).

Alert definitions are **Class A** — what a trader is watching and at which level
is their strategy. They stay in `localStorage` and are evaluated locally.

Design constraints that decide whether this is usable:

- evaluation continues with the tab in the background
- an alert fires **once** per crossing, with hysteresis so a price oscillating
  on a level does not produce a burst
- a missed evaluation window (throttled tab, brief disconnect) is detected and
  reported, rather than silently swallowing an alert that should have fired

## Acceptance criteria

- [ ] An armed alert fires within one candle of its condition becoming true
- [ ] It fires with the tab backgrounded
- [ ] A price oscillating around the level produces one notification, tested
- [ ] Alerts survive reload
- [ ] A gap in market data is detected and surfaced rather than ignored
- [ ] Definitions never leave the device
- [ ] German and English strings

## Out of scope

Server-side alerting that fires with the browser closed. That requires a
Cachy-operated server holding Class A alert definitions, which
[ADR-0004](../../adr/0004-spacetimedb-data-scope.md) forbids — a hosted variant
would need its own ADR and belongs to M7 at the earliest.

## Links

- Reference screenshots: Bitunix "Super Alert" panel
- `src/services/marketWatcher.ts`, `src/services/connectionManager.ts`
