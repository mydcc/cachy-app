---
id: FEAT-0454
title: Let an indicator alert compute over the price source its card is set to
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: none
adr: ADR-0012
depends_on: [BUG-0453]
assignee: claude-code
branch: feat/feat-0454-card-price-source
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

- [x] An alert seeded from an RSI card on `hl2` is computed over `(high + low) / 2`, and a
      recorded-history expectation proves it
- [x] Rules armed before the change keep their hash and their verdicts
- [x] Parity against the chart line for every source the selector offers

## Progress

- 2026-09-14, slice 1 — the engine. `IndicatorRef` gains an optional `field` (a
  `PriceField`) on the six indicators whose settings declare a changeable price
  source and whose chart line is drawn over it: rsi, macd, cci, momentum, ema,
  bollinger (`default_field` in `indicator.rs`, mirrored by `defaultFieldOf` and
  held to it by the catalogue test). `stochRsi.source` is fixed to `"close"`, so
  it is deliberately not among them. `computeIndicatorSeries` computes over that
  column in the chart's own arithmetic, parity-tested for every output and every
  `PriceField`; a recorded-history expectation pins RSI(14) over hl2. The panel
  still cannot write a `field`, the card still refuses, and the Indicators tab
  leaves a condition naming one unclaimed rather than rewriting it over the
  close.
- Named `field`, not `source`: on a price operand `source` is the last-or-mark
  series, and `field` is what a `PriceField` is called everywhere in a document.
- The questions above, settled:
  - **Hash.** A `field` naming the indicator's default price (close, hlc3 for
    CCI) is dropped both ways across the wire, so a rule armed before keeps its
    canonical form. Three hashes are pinned as literals taken from the code that
    armed them. The evaluator also keys series on the effective price: without
    that, RSI over hl2 and RSI over the close in one rule would share a series.
  - **WASM Technicals calculator.** Out of scope: it feeds the Technicals panel,
    not the alert path and not the chart line the ACs name.
  - **Alerts armed from a non-close card before BUG-0453.** Nothing to surface:
    the document never recorded the card's price, so it means the close, as it
    always computed. There is nothing to retarget it to.
- 2026-09-14, slice 2 — the panel.
  - **Seed.** A card drawn over any price copies it onto the reference
    (`cardAlertField`), omitted where it is the indicator's default
    (`referenceFieldFor`), so the draft is the document the core stores.
    `source-mismatch` remains only for stoch RSI drawn over another price than
    the close and for a value nobody recognises.
  - **Indicators tab.** A "Computed over" selector on the six indicators, read
    back from the reference and written into the subject and any window over it.
    `indicatorFormOf` claims such a condition; only a price the tab cannot show
    stays unclaimed. `canonicalRef` compares on the effective price.
  - **Sentence.** "RSI(14) from the median price (HL2)" / "RSI(14) aus dem
    Mittelkurs (HL2)", in a window too; the default stays unsaid.
  - **Acceptance.** The recorded-history hl2 expectation now arms the operand the
    RSI card on hl2 seeds, so the first criterion is proven end to end. The
    pinned hashes and slice 1's verdicts cover the second, the per-output parity
    test the third.
  - The Combo tab keeps a reference's price through its edits but does not offer
    one; a new row starts on the default.

## Links

- [`BUG-0453`](../bugs/BUG-0453-card-alert-ignores-price-source.md) — the containment this replaces
- [`FEAT-0446`](FEAT-0446-recorded-history-remaining-indicators.md) — CCI in group 2
