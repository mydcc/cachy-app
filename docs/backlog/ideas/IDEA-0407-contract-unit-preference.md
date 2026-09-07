---
id: IDEA-0407
title: Contract unit preference for order size input
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

# IDEA-0407 — Contract unit preference for order size input

## Why

The broker app lets traders enter order size By Qty (BTC), By Cost (USDT)
or By Position Size (USDT). Cachy has no equivalent: size entry is always
in contracts. A local input preference would match broker behaviour.

## Notes

- No broker state involved: contract unit is input display only, there is
  no venue endpoint for it (checked 2026-09-08: zero hits in
  `docs/bitunix-api`, `src/utils/server/venues`, `src/routes/api`).
- Class A: stays on the device, like fee preferences. A Settings entry
  (not a trade-panel broker chip) is the honest place — nothing travels.
- Open: switch location (Settings Display vs trade-panel default), default
  per symbol, conversion point into the sizing maths (`decimal.js`).

See also: BUG-0409 (broker screenshots transcribed there).
