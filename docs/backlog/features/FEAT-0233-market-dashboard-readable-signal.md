---
id: FEAT-0233
title: Make the Market Dashboard signal readable and distinguish missing data from a sell signal
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: C
adr: none
depends_on: [BUG-0230, BUG-0232]
---

# FEAT-0233 — Readable Market Dashboard signal

## Problem

The dashboard showed a bare "Score" column with no way to interpret it. A user
cannot tell whether 60 means long, short, scalp, or nothing — the number is
presented without units, direction, or basis.

Worse, unanalysed symbols were given a placeholder `confluenceScore: 0`. On the
confluence scale 0 is **"Strong Sell"**. A symbol nobody had looked at yet
rendered as the strongest sell signal on the board, in an app whose next screen
sizes a real position. Placeholder prices of `$0.000000` and `0.00%` change
carried the same problem in a milder form.

Two header cards were also arithmetically wrong rather than merely unclear:

- **Market Heat** averaged RSI over *all* favourites while summing only the
  analysed ones, and folded each placeholder's fabricated RSI of 50 into the
  mean — pulling the reading toward a confident-looking middle.
- **Market Breadth** divided `analysisState.bullishCount` by the total
  favourites count, so unanalysed symbols silently counted as "not bullish".

The Status card occupied a quarter of the header to display one word.

## Solution

**Lead with the level, support with the score.** `ConfluenceAnalyzer` already
produced `level` (Strong Sell … Strong Buy) and `contributing` (`["+15 MA Trend
Bullish", "-5 RSI Bearish"]`). Both were computed and discarded. They are now
carried through `SymbolAnalysis` and rendered:

- The Signal column shows a localised direction ("Strong Long", "Long Bias",
  "No Bias", "Short Bias", "Strong Short") with the numeric score beside it.
- Its tooltip states what the score measures, that 50 is neutral, that it is a
  directional bias and **not** a trade signal — then lists the actual
  contributing factors for that row.

**Missing data looks missing.** No fabricated score, no fabricated price. The
row renders "No data", sorts to the bottom, and dims. Symbols outside the
analysis scope say so and point at the setting that changes it.

**Trend cells distinguish "flat" from "not measured".** `unknown` renders
hollow/dashed; `neutral` renders solid grey.

**Header rebuilt.** Status collapses to a one-line strip that also reports
coverage ("4 of 6 analysed"). The freed column goes to a Funding + 24h volume
column in the table. Heat and Breadth compute over analysed rows only, show "—"
when there is nothing to average, and Breadth publishes its sample size (`n=4`).

**Top Opportunity** ranks by distance from neutral, not by raw score — a
score of 8 is as strong a read as 92, in the other direction. Ranking by raw
score could only ever surface longs. Its tooltip says it is the strongest bias
among favourites, not a recommended trade.

## Acceptance criteria

- [x] The Signal column shows a direction, not only a number
- [x] A tooltip explains the score's scale, basis and limits
- [x] The tooltip lists the score's actual contributing factors
- [x] An unanalysed symbol never renders as "Strong Sell" or a $0 price
- [x] Out-of-scope symbols say why they are not analysed
- [x] `unknown` trend cells are visually distinct from `neutral`
- [x] Heat and Breadth are computed over analysed rows only
- [x] Breadth reports its sample size
- [x] Status is one line; funding rate and 24h volume are shown per row
- [x] All new strings exist in German and English
- [x] Verified against the running app with a mix of analysed and unanalysed
      favourites

## Out of scope

- Open Interest, Long/Short ratio and volume delta — new endpoints and extra
  request load; revisit once BUG-0230's load profile is confirmed settled.
- Turning the score into an actionable trade signal. It is a bias measure; the
  UI now says so rather than implying otherwise.

## Links

- `docs/backlog/bugs/BUG-0230-market-analyst-fetch-storm.md`
- `docs/backlog/bugs/BUG-0232-divergent-favourites-stores.md`
