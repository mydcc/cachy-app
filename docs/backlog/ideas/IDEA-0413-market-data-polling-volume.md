---
id: IDEA-0413
title: Market-data polling volume (per-timeframe klines plus funding bulk)
type: idea
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: market-data
data_class: C
adr: none
depends_on: []
---

# IDEA-0413 — Market-data polling volume (per-timeframe klines plus funding bulk)

## Why

Observed live Sep 2026 (reporter Network log, dev mode): for one symbol
(SOLUSDT) about thirteen `klines?provider=bitunix&symbol=…` rows of
~23 kB each fire within a cycle — one per timeframe — then rotation
moves to the next symbol every few seconds; a `funding-rate?provider=
bitunix` bulk of 185 kB rides along. Contents barely change between
cycles (candles move slowly), so most bytes reaffirm what is already
known.

## Notes

- No breakage and no link to the mode-chip bugs (separate endpoints,
  separate limiter) — pure volume observation.
- Reported 2026-09-08 alongside BUG-0409 research; the reporter asked
  for a separate performance note rather than action.
- Open directions (not decided): fewer timeframes per cycle, longer
  intervals for slow symbols, delta/incremental updates, or skip-unless-
  visible. Rate-limiter interaction (`apiService`, 5 req/s Bitunix)
  belongs in the analysis — bursts queue visibly today.
