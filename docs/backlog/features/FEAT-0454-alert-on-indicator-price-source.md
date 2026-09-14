---
id: FEAT-0454
title: Let an indicator alert compute over the price source its card is set to
type: feature
status: in-progress
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: none
adr: ADR-0012
depends_on: [BUG-0453]
assignee: claude-code
branch: feat/feat-0454-indicator-price-source
start_date: 2026-09-14
---

# FEAT-0454 — Let an indicator alert compute over the price source its card is set to

## Problem

The RSI, CCI, Momentum and EMA settings cards let a trader draw the indicator over `open`,
`high`, `low`, `hl2` or `hlc3` instead of the close. An alert cannot follow: each
indicator on the alert path is computed over one fixed price — the close, or for CCI the
typical price (`alertPathSourceOf`, FEAT-0446 group 2) — and the core registry has no
parameter to name another.

Since [`BUG-0453`](../bugs/BUG-0453-card-alert-ignores-price-source.md) the card's alert
action refuses on such a card and says why, so no alert lands on the wrong line. But a
trader who reads RSI on `hl2` still cannot alert on it at all, and the CCI card defaults
to `hlc3`.

## Proposal

Carry the source as an optional parameter rather than as a panel setting:

- an optional `source` parameter in `technicals-wasm/src/rule/indicator.rs` for the
  indicators whose cards have one, defaulting to `close` so every existing document means
  what it meant
- `computeIndicatorSeries` reads the named price column
- the settings seed copies the card's source, and `cardAlertAvailability` stops refusing
- the Indicators tab offers the choice, and the plain-language sentence names it

## Questions to settle first

- Does adding an optional parameter with a default change the document hash of rules
  already armed? It must not.
- Does the WASM Technicals calculator gain the same parameter in the same change? It has
  the same gap today (`wasmCalculator.ts` passes no source).
- An alert armed from a non-close card before [`BUG-0453`](../bugs/BUG-0453-card-alert-ignores-price-source.md)
  keeps computing over the close and carries no source, so it cannot be retargeted
  automatically. Decide whether to surface or re-ask those when this lands.

## Acceptance criteria

- [ ] An alert seeded from an RSI card on `hl2` is computed over `(high + low) / 2`, and a
      recorded-history expectation proves it
- [ ] Rules armed before the change keep their hash and their verdicts
- [ ] Parity against the chart line for every source the selector offers

## Links

- [`BUG-0453`](../bugs/BUG-0453-card-alert-ignores-price-source.md) — the containment this replaces
- [`FEAT-0446`](FEAT-0446-recorded-history-remaining-indicators.md) — CCI in group 2
