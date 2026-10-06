---
id: BUG-0633
title: The closeAllPositions benchmark aborts because closing the position reports an error
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
# assignee:            # required while status: in-progress (who is working this)
---

# BUG-0633 — The closeAllPositions benchmark aborts because closing the position reports an error

## Symptom

`src/tests/closeAllPositions.bench.ts` fails in every run, under both benchmark
projects:

```
FAIL  src/tests/closeAllPositions.bench.ts > tradeService benchmark (Optimized)
       > closeAllPositions with pre-fetch
Error: trade.closeAllFailed
 ❯ TradeService.reportFlattenShortfall src/services/tradeService.ts:2400:15
```

The benchmark throws before it can measure anything, so the "Optimized" variant
of this benchmark produces no numbers at all.

## Evidence

*Demonstrated* — `npm run benchmark:technicals` on `chore/vitest-5`:

```
Tests  5 failed | 86 passed | 4 skipped (91)
```

Reported under both `|unit (bench)|` and `|components (bench)|`, so it is not a
project-collection artefact.

## Cause

**Unknown.** The benchmark exercises `closeAllPositions` with pre-fetched
candles, and the code reaches `reportFlattenShortfall`, which raises
`trade.closeAllFailed`. Whether that is the intended path for this fixture, or
the benchmark's setup produces a state the service legitimately rejects, has not
been established — reading the benchmark would not settle it, only running it
does.

## Fix

Deliberately unspecified. Two very different outcomes are possible and they
imply opposite fixes:

- The fixture is wrong, and correcting it makes the benchmark measure the path it
  was written for.
- The service rejects a state that real usage can produce, in which case this is
  a defect in `tradeService` and the benchmark has been reporting it all along.

Deciding which needs a first-hand read of `reportFlattenShortfall` and
`closeAllPositions` together with the benchmark's setup. Whoever picks this up
should not assume the benchmark is the innocent party.

## Acceptance criteria

- [ ] It is established which side is wrong, with the failing call traced to a
      specific condition in `tradeService`
- [ ] `npm run benchmark:technicals` reports a result for
      `closeAllPositions with pre-fetch` instead of an error
- [ ] If the service turns out to be at fault, that is filed separately — an
      `area: execution` item, which never goes to the automated dispatch

## Links

- BUG-0631 — the other benchmark-harness defect
- FEAT-0630 — the migration that made this visible
