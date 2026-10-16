---
id: FEAT-0692
title: Let the deep dive analyse paper trades, never mixed with real ones
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
assignee: opencode
branch: feat/paper-deepdive-analysis
---

# FEAT-0692 — Let the deep dive analyse paper trades, never mixed with real ones

## Problem

A paper-only journal renders an empty deep dive. Every chart there is fed from
`journalState.analysisEntries`, which is
`entries.filter((e) => e.isPaper !== true)`
(`src/stores/journal.svelte.ts:294`) — and with paper trades as the only
population, every series comes out empty. The trades are visible in the journal
list, badged and filterable, but the analytics view draws blank axes with no
word about why. The Live/Paper/All filter lives in the table tab and never
reaches the deep dive, so switching it to Paper changes the list and nothing
else.

The exclusion itself is deliberate and stays: `FEAT-0327` pins that a paper
fill never moves a real statistic, and the setting text promises exactly that.
What is missing is the other half — a paper run that can be reviewed against
itself, clearly marked as simulated.

## Proposal

Make the deep dive mode-aware, with one non-negotiable rule: real and paper
figures are never mixed into one number, series or total.

- `tradeMode = paper` → the deep dive is computed from paper entries and
  carries a permanent simulation marker, so the chart set can never be
  mistaken for a real track record.
- `tradeMode = live` → unchanged: computed from real entries.
- `tradeMode = all` → real entries only, plus a visible hint that paper trades
  stay out of the analysis.
- A mode whose population has no closed trades yet says so by name instead of
  drawing empty axes.

Mechanically: the store gains a `paperEntries` set and the deep-dive metric set
mirrored over it — same calculators, same shapes, separate deriveds. The
component picks the source from the journal's existing mode filter, which
`JournalContent` passes down. No calculator change, no mixing; `analysisEntries`
keeps its exact meaning, so the pinned "a paper trade never moves a real
statistic" tests stay untouched and green.

## Acceptance criteria

- [x] `tradeMode = paper` drives every deep-dive chart from paper journal
      entries; `tradeMode = live` from real ones — asserted by a component test
      whose two trades carry distinct values
- [x] A store test proves the sets cannot mix: a paper fill moves only the
      paper series, a real fill only the real series
- [x] Paper mode carries a permanent, visible simulation marker on the deep
      dive
- [x] `tradeMode = all` renders real trades only, with a visible hint that
      paper trades are not part of the analysis
- [x] A mode with no closed trades shows a named empty state, not blank axes
- [x] Every new text exists in DE and EN; no hardcoded strings
- [x] The existing paper/journal tests stay green, in particular the pinned
      "a paper trade never moves a real statistic" pair

## Out of scope

- Mixing real and paper trades into one series, average or total — never.
- The Overview charts (`JournalCharts.svelte`) and the header statistics keep
  today's semantics; a follow-up may align them.
- A mode switcher inside the deep-dive tab itself: the journal's Live/Paper/All
  filter stays the single control.
- `analysisEntries`, the daily-loss limit, and the AI context
  (`ai.svelte.ts`) keep reading real trades only.
- Persisting `tradeMode` across reloads.

## Open questions

None — `all` deliberately means "real trades only, hint shown", and the mode
switch stays the journal's existing Live/Paper/All filter.

## What shipped

- `src/stores/journal.svelte.ts` — `paperEntries` plus the paper mirror of
  every deep-dive metric: same calculators, separate `$derived`s, so the two
  populations cannot mix.
- `src/components/shared/journal/JournalDeepDive.svelte` — source selection by
  the journal's Live/Paper/All filter, a permanent SIM marker in paper mode, a
  hint in `all`, and named empty states instead of blank axes.
- `src/components/shared/JournalContent.svelte` — passes `tradeMode` down.
- DE/EN strings; `src/stores/journal_paperAnalysis.test.ts` and
  `JournalDeepDive.paperAnalysis.component.test.ts` pin the split, the marker
  and the empty states.

## Links

- [`FEAT-0327`](FEAT-0327-paper-trading-account-tracking.md) — writes
  `isPaper: true` and pins "none of them moves a performance statistic"
- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md)
  — journal data stays Class A
- `src/stores/journal.svelte.ts`,
  `src/components/shared/journal/JournalDeepDive.svelte`,
  `src/components/shared/JournalContent.svelte`
