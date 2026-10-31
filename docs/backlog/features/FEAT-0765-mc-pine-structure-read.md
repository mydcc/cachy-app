---
id: FEAT-0765
title: Teach the mc.pine structure read in the Academy
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0686]
assignee: opencode
branch: feature/feat-0765-mc-pine-structure-read
---

# FEAT-0765 — Teach the mc.pine structure read in the Academy

## Problem

The structure tab's live layer marks N-bar fractals and close breaks. The
trader's own PineScript (mc.pine) reads the market differently: swings need a
minimum ATR distance, a BOS only counts after the inducement was crossed, a
wick through the extreme that closes back inside is a sweep, and the
Fibonacci levels hang on the current structure range. A learner practises on
the tab with a read the live chart does not mark.

## Proposal

Port the lesson-relevant parts of mc.pine as pure TypeScript
(`structureRead.ts`) and make them the tab's canonical read:

- ATR-filtered swing detection (amplitude filter, confirmed-bar only).
- CHoCH/BOS state machine with the inducement gate and a body-vs-wick break
  option.
- Sweep events (wick through the running extreme, close back inside) with the
  "S" marker.
- The inducement line, dotted, titled IDM.
- Fibonacci levels (0.236–0.886) on the current structure range, replacing
  the nearest-R/S lines on the s3 chart; the reading text keeps naming the
  nearest levels.
- EMA trio 21/50/200 on the s1 chart, computed through the catalogue engine
  and merged into a series override; the card adds a trio-direction reading.

## Acceptance criteria

- [x] `structureRead.ts` is pure, documented and covered by hand-built
      fixtures (trend BOS, inducement-gated BOS, sweep, CHoCH, flat noise,
      Fibonacci math).
- [x] The s2 chart draws swing dots, CHoCH/BOS arrows, the sweep "S" and the
      dotted IDM line from `computeStructureRead`.
- [x] The s3 chart draws the six Fibonacci levels of the current range; the
      reading still names the nearest resistance/support.
- [x] The s1 chart draws the EMA trio through the chart's new `series`
      override; the card shows the trio direction.
- [x] Colors come from CSS variables (`--accent-color`, `--warning-color`,
      `--text-secondary`), never Pine literals.
- [x] No interpreter, no `.pine` loading: mc.pine stays a reference document.
- [x] DE/EN legend strings for sweep and IDM; `schema.d.ts` regenerated.

## Out of scope

- Order blocks, FVGs, Alligator, trendlines and the three-bar reversal
  (documented as a follow-up, YAGNI for these lessons).
- A settings surface for the port's parameters (fixed lesson defaults).
- The forming-bar repaint behaviour of the TradingView indicator (events are
  confirmed-bar only).

## Links

- FEAT-0686 — the live cockpit this deepens
- `src/lib/academy/structureRead.ts`, `src/lib/academy/structureSignals.ts`
- mc.pine (trading-corpus, not part of this repo) — semantic reference only
