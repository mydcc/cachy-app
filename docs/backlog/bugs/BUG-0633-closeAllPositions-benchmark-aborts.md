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

**Established by measurement (2026-10-07), not unknown.** Three hypotheses were
tested and the first two disproved by instrumenting the run:

1. ~~`omsService.getPositions` returns stale positions after the send~~ — no.
   `verifyFlat` does not read it; it calls `readFreshPositions`.
2. ~~`exchangeSignedFetch` needs mocking~~ — no. Instrumented directly: the
   signed call is reached **0 times**, so the verification fails *before* any
   network access.
3. ~~`settingsState.apiKeys` is the wrong source~~ — no. `keysForActiveAccount`
   reads `accounts`/`activeAccountId`, but supplying those changes nothing.

The actual blocker: `closeAllPositions` → `gatedRequest` → `orderGate.submit`,
and `orderGate` refuses an intent with no `confirmedAt` — the timestamp of a
human confirmation, FEAT-0024. The benchmark stubs `signedRequest` and so
bypasses the gate, but `verifyFlat` still runs afterwards and reports
`unverified: true`, which raises `trade.closeAllFailed`.

That is a security feature on a money path. Unhooking it inside a benchmark
is not a call to make from a desk.

## Options

- **A** — Rebuild the fixture so it passes the gate the way the app does
  (simulated confirmation). Faithful, but it means encoding an order-confirmation
  path in a performance measurement.
- **B** — Drop `closeAllPositions` from `benchmark:technicals` and document that
  it is not measurable while a safety gate sits in front of it. Honest, loses
  the measurement.
- **C** — Decide with someone reading `tradeService` and `orderGate` together.

Left open deliberately. The recommendation is C, then B if the measurement turns
out not to be worth an order-confirmation harness.

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
