---
id: FEAT-0803
title: The pivot section names its type, timeframe and basis candle
type: feature
status: done
shipped: v1.6.0-beta.526 (PR #4525)
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

# FEAT-0803 — Make the pivot levels checkable against the chart

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

## Review follow-ups

Raised by the code review of PR #4525 and fixed in the same branch:

- The basis-candle match moved to `src/utils/pivotBasis.ts` and compares with a
  relative tolerance instead of `===`. One bit of f64 noise between
  `pivotBasis` and the series used to drop the timestamp silently — the same
  thing a genuinely missing candle looks like. `pivotBasis.test.ts` pins it (the
  tolerance case is red against `===`).
- `projection` no longer claims "the last closed candle". The calculator reads
  `closesNum.length - 2`, so the string says "the second-newest candle — usually
  the last closed one"; the Fibonacci formula says "basis candle" for the same
  reason.
- The help moved from a `title` attribute to the shared `InfoTip` marker:
  `title` was mouse-only. The basis time is formatted in the app locale rather
  than the browser's, and the hardcoded `|| "Pivot Points"` fallback is gone.
- File size: the panel is ~1085 lines, above the 800-line soft ceiling. Not
  split here — the extraction would touch the whole render tree, and the util
  above is the first piece a later split can grow from.

## Links

- BUG-0805 — the dead controls removed first
- Branch slug keeps the number it was created with (`feat-0776`); the item was
  renumbered twice because numbers are shared across types: 0776 is taken by
  BUG-0776, and 0797 by BUG-0797 (which landed on `develop` through PR #4529
  after this branch forked, so the collision only appears once the branch is
  rebased — `backlog:check` fails on it).
- `src/utils/pivotBasis.ts` — the basis-candle lookup, kept import-free so it
  adds no edge to the import graph (BUG-0799 ratchets it).
- `src/components/shared/TechnicalsPanel.svelte`
- `src/utils/indicators.ts` (`calculatePivotsFromValues`), `technicals-wasm/src/lib.rs` (`compute_pivot_levels`)
- FEAT-0766 — the context block that already names its own timeframes
