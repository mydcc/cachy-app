# Academy lesson cards

Working material for the Academy's content. Each card states what one indicator
measures, how its readings are interpreted, **and — the part that matters — the
conditions under which it is not telling you anything.**

The lesson text shipped in `src/locales/locales/{de,en}.json` is written *from*
these cards. The cards are the reviewable intermediate: the point at which the
wording can be argued with, before it becomes two hundred and thirty strings in
the app that nobody re-reads.

## What belongs in a card, and what does not

A card carries **interpretation** and **limits**:

- what the indicator measures, in one or two sentences
- how its readings are actually read
- the conditions that make its readings meaningless
- what it pairs with to become a setup
- how it is drawn on the chart

A card does **not** carry **facts that already exist elsewhere**:

- **Parameters, defaults and outputs** live in
  `src/lib/alerts/indicatorCatalogue.ts`. A card that restates them will drift.
- **Formulas and warm-up behaviour** live in
  `technicals-wasm/src/rule/indicator.rs`, which is the authoritative registry
  and the source that decides what the engine actually computes.
- **Anything about where an idea came from.** No card names a source. The review
  happens outside this repository; what lands here is the checked result.

That is the whole point of the separation: a card is a claim someone stands
behind, not a passage someone pasted.

## Why `failureModes` is the load-bearing field

Almost every trading course explains what an indicator *claims* and stops. The
indication that a learner can act on a reading is knowing when the reading is
worthless — because the same number means opposite things depending on the
market it is printed over, and that dependency is exactly what is left out.

A card without a `failureModes` entry is incomplete. If an indicator has no
meaningful failure mode, that is a finding, and it belongs here too — an honest
"this one rarely misleads, and here is why" is worth more than a manufactured
caveat.

## Status

Cards are drafted, then reviewed, then the lesson text is written from them.
Cards for every indicator the engine computes are here; the ones not yet
reviewed say so. An unreviewed card is a draft, and nothing ships from a draft.

Coverage, by group. Every catalogue entry is covered; the moving averages share
one card because they differ only in weighting and their failure modes are
identical, so the count of cards is lower than the count of indicators:

| File | Cards | Indicators | |---|---|---| | [`oscillators.md`](oscillators.md)
| 8 | 8 | | [`trend.md`](trend.md) | 7 | 10 | | [`volatility.md`](volatility.md)
| 3 | 3 | | [`volume.md`](volume.md) | 2 | 2 | | **Total** | **20** | **23** |

## Links

- FEAT-0677 — the Academy indicator category these cards feed:
  [`docs/backlog/features/FEAT-0677-academy-indicators-category.md`](../backlog/features/FEAT-0677-academy-indicators-category.md)
- FEAT-0679 — market structure content
- `src/lib/alerts/indicatorCatalogue.ts` — parameters, defaults, outputs
- `technicals-wasm/src/rule/indicator.rs` — the authoritative registry
