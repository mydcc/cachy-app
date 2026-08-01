---
id: FEAT-0030
title: Combine several conditions into one alert
type: feature
status: idea
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0028]
---

# FEAT-0030 — Combine several conditions into one alert

## Problem

Real setups are conjunctions: RSI oversold *and* price at support *and* volume
above average. Separate alerts for each produce noise, not a signal.

## Proposal

Several conditions joined with AND/OR, a validity window, and a note. The UI
challenge is bigger than the engine: a condition builder that a trader can read
back and trust is what makes this useful, and a builder that produces
unintelligible logic is worse than three separate alerts.

## Acceptance criteria

- [ ] Conditions combine with AND and OR, and the resulting logic is displayed
      in plain language in both locales
- [ ] A validity window expires the alert without firing
- [ ] A combined alert fires exactly once when all conditions hold
- [ ] Conditions that hold at different times do not fire unless the
      simultaneity rule stated in this item says they should
- [ ] The evaluation cost stays bounded with many alerts armed

## Open questions

- **What does simultaneity mean?** All conditions true in the same evaluation
  tick, or each true at some point within a window? Both are defensible and they
  are different features.

## Links

- Reference screenshots: Bitunix "Super Alert" — Combo tab
- [`FEAT-0028`](FEAT-0028-indicator-alerts.md)
