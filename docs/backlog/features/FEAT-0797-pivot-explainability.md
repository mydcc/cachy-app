---
id: FEAT-0797
title: The pivot section names its type, timeframe and basis candle
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: feature/feat-0776-pivot-explainability
---

# FEAT-0797 — Make the pivot levels checkable against the chart

## Problem

The Technicals panel printed `R3 … S3` as seven bare numbers. A pivot level is a
formula applied to the **previous closed candle**, so nothing on screen said
which candle, which timeframe or which of the four formulas produced it. A user
who opens the chart and looks for the level cannot find it, and has no way to
tell whether the number is wrong or the expectation is.

Three separate facts were missing, and each one is enough to make the row
unverifiable:

- the selected type (classic, woodie, camarilla, fibonacci) — invisible, so
  "Fibonacci" looks like a retracement tool although it applies 0.382/0.618 to a
  single candle's range;
- the timeframe — the panel computes on `tradeState.analysisTimeframe`, while
  the chart window carries its own;
- the basis candle — `pivotBasis` (H/L/C) existed in `TechnicalsData` and was
  never rendered.

## Proposal

Keep the seven rows, and add three things around them:

1. **Header** — `Pivot Points` on the left, `Classic · 1h` on the right.
2. **Tooltip** on the header and the basis row — the formula for the selected
   type, plus a note that R2/R3 and S2/S3 lie outside the basis candle's range
   and are projections, not observed prices. The Fibonacci text states that the
   H−L range is the last candle's, not a swing retracement.
3. **Basis row** — `Basis 1h · 14:00` with `H / L / C` from `pivotBasis`,
   formatted with the panel's precision.

The timestamp is read back from the analysis series by matching the three basis
values; when the series no longer holds that candle (a new candle arrived
between the calculation and the render) the time is dropped instead of guessed.
A wrong timestamp would be worse than none, because it would make the levels
look checkable while pointing at the wrong bar.

## Acceptance criteria

- [x] The header names the pivot type and the analysis timeframe.
- [x] The tooltip carries the formula of the **selected** type and the
      projection note; switching the type changes it.
- [x] The basis row prints `Basis <tf> · <time>` and the H/L/C values the
      calculator used.
- [x] Without a matching candle the row keeps H/L/C and omits the time.
- [x] No new hardcoded colour; both strings in `de.json` and `en.json`;
      `schema.d.ts` regenerated.
- [x] A component test pins the header, the basis values, the type-dependent
      tooltip and the dropped timestamp.

## Out of scope

- Drawing these levels (or the context block's support/resistance) in the chart
  as price lines — the follow-up step.
- Aligning the panel's analysis timeframe with the chart window's timeframe.
- Renaming the four pivot types in Settings.

## Links

- BUG-0796 — the dead controls removed first
- Branch slug keeps the number it was created with (`feat-0776`); the item was
  renumbered to 0797 because BUG-0776 already owns 0776 — numbers are shared
  across types.
- `src/components/shared/TechnicalsPanel.svelte`
- `src/utils/indicators.ts` (`calculatePivotsFromValues`), `technicals-wasm/src/lib.rs` (`compute_pivot_levels`)
- FEAT-0766 — the context block that already names its own timeframes
