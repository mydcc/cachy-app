---
id: BUG-0656
title: The persistence guard's source scanner loses 9 real write sites to an apostrophe in a comment
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: persistence
data_class: A
adr: none
depends_on: []
---

# BUG-0656 — The persistence guard's source scanner loses 9 real write sites to an apostrophe in a comment

## Symptom

`settings.persistenceContract.test.ts` strips comments and string literals from
every source file under `src/` before it looks for writes to a setting. Its
stripper blanks far more than comments and literals. Across the tree it hides
**9 real `settingsState.<key> =` write sites in 4 files**, and on
`settings.svelte.ts` it blanks 61% of the file.

No assertion is currently wrong: `MISSING_DEFAULT`, the one map that consumed
this scan, is empty. The defect is that the guard can no longer be trusted to
pass for the right reason — the moment a key lands in that map, the scan cannot
see a writer that exists.

## Evidence

**Measured, with the shipped `stripNonCode` applied verbatim.**

The implementation was five chained regex replacements, literals before comments:

```
.replace(/`(?:\\[\s\S]|[^`\\])*`/g, " ")
.replace(/"(?:\\[\s\S]|[^"\\])*"/g, " ")
.replace(/'(?:\\[\s\S]|[^'\\])*'/g, " ")     <-- the single-quote pass
.replace(/\/\*[\s\S]*?\*\//g, " ")
.replace(/\/\/[^\n]*/g, " ")
.replace(/<!--[\s\S]*?-->/g, " ");
```

That order is right in one direction and wrong in the other. The comment in the
guard's own docstring explains why literals must go first — a URL in a string
contains `//`, so stripping comments first would eat the rest of the line. The
mirror image was missed: an apostrophe in a comment opens a "string" that runs
to the *next* apostrophe, and `[^'\\]` matches newlines, so the region can span
lines and take real code with it. `settings.svelte.ts` has 15 such comment lines
(`the user's choice`, `don't call save()`, `the operator's AI keys`).

Consequences, measured:

| | |
|---|---|
| `settings.svelte.ts` | 89,828 → 35,005 characters, **39% survives** |
| content lines emptied | **1,205 of 2,054** |
| write sites hidden under `src` | **9 of 84**, in 4 files |

The hidden writes, and the keys they target:

| File | Key |
|---|---|
| `src/components/settings/tabs/VisualsBackground.svelte` (5 of 5) | `backgroundType`, `backgroundOpacity` |
| `src/components/inputs/TradeSetupInputs.svelte` (2 of 2) | `autoUpdatePriceInput` |
| `src/components/results/PlaceOrderPanel.svelte` (1 of 1) | `autoUpdatePriceInput` |
| `src/components/shared/PositionsList.svelte` (1 of 1) | `pnlViewMode` |

`pnlViewMode` is the field BUG-0652 closed. Its writer being invisible is
exactly the shape of mistake that guard exists to catch.

## Cause

Ordering five independent regex passes cannot work, because whether a quote
character delimits a literal or is just a character depends on what came before
it. No sequence of "strip X before Y" rules gets both `//`-in-a-URL and
apostrophe-in-a-comment right.

## Fix

Replace the passes with a single walk that tracks state, in
`src/stores/settings/sourceScan.ts`:

- line comment, block comment, HTML comment, `"`, `'`, `` ` `` — each consumed
  by one branch, with escapes handled, no ordering to get wrong
- an unterminated single- or double-quoted string stops at the newline, so one
  stray quote cannot blank the rest of the file
- newlines survive so line numbers in failures still line up

Both guards import it, so a second copy cannot rot.

## Acceptance criteria

- [ ] `stripNonCode` hides zero `settingsState.<key> =` write sites anywhere
      under `src`, asserted as its own test
- [ ] The apostrophe-in-a-comment case has a test — that is the one that shipped broken
- [ ] The `//`-in-a-URL case still has a test — that is why the order was what it was
- [ ] `methodBody` counts braces on stripped source, so a `}` in a comment or
      string cannot truncate a method
- [ ] `settings.persistenceContract.test.ts` and `settings.loadContract.test.ts`
      both import the shared helper
- [ ] Both guards green, and the save guard's five assertions still hold

## Links

- `src/stores/settings/sourceScan.ts` — the replacement, with both failure
  modes documented
- `src/stores/settings/sourceScan.test.ts` — the repo-wide assertion
- `src/stores/settings.persistenceContract.test.ts` — the guard this broke
- BUG-0652 — the save-side contract, and the reason `pnlViewMode` matters here
- BUG-0653 — the load-side guard, which needs the same helper