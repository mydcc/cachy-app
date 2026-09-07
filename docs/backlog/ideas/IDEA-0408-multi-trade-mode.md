---
id: IDEA-0408
title: Multi-trade mode (one position vs position per trade)
type: idea
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: []
---

# IDEA-0408 — Multi-trade mode (one position vs position per trade)

## Why

The broker app offers Multi-Trade Off (trades merge into one position) vs
On (each trade keeps its own position, Position A/B). Switchable anytime,
affects new orders only. Cachy always plans single-position entries.

## Notes

- No venue endpoint in `docs/bitunix-api`, no code in
  `src/utils/server/venues` or `src/routes/api` (checked 2026-09-08).
  API research first: broker-side setting or pure order-placement default?
- If app-side only, it is an order default (trade panel), not a broker
  chip — never behind a control that implies the exchange was told.
- Open: relation to hedge mode (overlapping?), per-symbol default,
  journal/PnL attribution per sub-position.

See also: BUG-0409 (broker screenshots transcribed there).
