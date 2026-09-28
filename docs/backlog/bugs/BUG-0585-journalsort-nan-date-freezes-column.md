---
id: BUG-0585
title: A row with an unparseable date silently freezes the whole journal sort column
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: journal
data_class: none
adr: none
depends_on: []
---

# BUG-0585 — An unparseable date silently freezes the journal sort column

## Symptom

One journal row whose `date` or `exitDate` cannot be parsed makes the entire
date column stop sorting. The bad row does not move to either end; it sits
wherever it happened to be and the rows around it keep their relative order,
so the table looks sorted while it is not.

## Evidence

**Derived** — read off the comparator; reproduced by running the exported
function, not by observing a user.

In `src/lib/journalSort.ts` the date branch parses without a `NaN` guard:

    // lines 76-78
    if (field === "date" || field === "exitDate") {
        return parseDateish(row.date) ?? parseDateish(row.exitDate);
    }

`Date.parse` returns `NaN` for an unparseable string, and in the three-way
comparator at lines 91-92 every comparison against `NaN` is `false`, so the
comparator returns `0` — "equal to everything". The row therefore never moves
and acts as a barrier.

Running the module's own `sortJournalRows` on six rows where the third has
`date: "13/45/2026"`:

    input        : jan01, jan02, BAD, jan03, jan04, jan05
    asc expected : BAD, jan01, jan02, jan03, jan04, jan05
    asc actual   : jan01, jan02, BAD, jan03, jan04, jan05   <- wrong

The same module's `duration` branch *does* guard (`isNaN(start) || isNaN(end) ? 0`,
line 66), and `parseDateish` at lines 40-45 exists to normalise exactly this
case — the direct date branch just does not use it for the `NaN` outcome. The
inconsistency is within one function.

`src/lib/journalSort.test.ts` does not cover it: every date fixture is a
well-formed `…T00:00:00.000Z` string, so the suite is blind to it.

## Cause

`parseDateish` returns `null` for `null`/`undefined` input but a `Date.parse`
result for a bad string, and nothing distinguishes the two. The comparator
treats a `NaN` key as "equal to everything" instead of as "no value".

## Fix

Route the date branch through the same `NaN` handling the `duration` branch
uses, and decide explicitly where a row with an unparseable date belongs —
almost certainly the blank bucket, i.e. the bottom, matching what BUG from
`ea116d72` established for genuinely missing values.

Also settle the parallel question this exposes: `entryDate` is a valid
`SortField` (`JournalContent.svelte:178` types it as
`keyof JournalEntry | "duration" | …`) but is not in the parse list at line 76,
so it falls through to `localeCompare` on the raw string.

Leave `sortJournalEntries` alone — it does no date parsing at all and that is a
separate, already-noted inconsistency, not part of this fix.

## Acceptance criteria

- [ ] A test sorts a list containing one unparseable date and fails without the fix
- [ ] The test passes with the fix, and pins where the bad row lands
- [ ] `entryDate` sorts chronologically, not lexicographically, and is either
      covered by a test or explicitly excluded
- [ ] `sortJournalRows` and the `duration` branch agree on what a missing value means

## Links

- BUG from `ea116d72` "fix(journal): keep blank rows at the bottom of descending sorts" — the blank-placement decision this extends to unparseable dates
