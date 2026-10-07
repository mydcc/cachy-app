---
id: BUG-0633
title: The closeAllPositions benchmark aborts because closing the position reports an error
type: bug
status: done
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

> **Superseded — see [Resolution](#resolution).** The conclusion below blames the
> confirmation gate. Traced during the fix, that is not what happens on this path;
> the real cause is a half-stubbed fixture. Kept as written because the reasoning
> is worth reading, but do not act on it.

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

## Resolution

**Option B**, and the fixture — not `tradeService` — is the side that was wrong.
The cause recorded above turned out to be inaccurate, so it is corrected here.

### Which side is wrong

The benchmark stubs `tradeService.signedRequest`, the transport `orderGate.submit`
calls *after* it has verified the intent. Stubbing it makes the close look like it
went out. It does not stub `readFreshPositions`, and `closeAllPositions` calls
`verifyFlat` immediately after the dispatch, which reads exactly that. So the
benchmark stubbed the send and left the check real — and the check correctly
answered that nothing could be confirmed:

`verifyFlat` → `readFreshPositions` returns null → `unverified: true` →
`reportFlattenShortfall` (`tradeService.ts:2400`) → `trade.closeAllFailed`.

That is the specified behaviour of a post-flatten verification, not a defect. The
benchmark was measuring a close that never happened.

The fixture is stale rather than broken. `docs/archive/engineering-log-2026-h1.md`
records `npx vitest bench --run src/tests/closeAllPositions.bench.ts` completing
cleanly, with the `mkPosition` helper added in a cleanup pass. It predates the
post-flatten verification: when `verifyFlat` was added to `closeAllPositions`, the
benchmark gained a step it could not satisfy and was never updated. It has been
reporting that since, in every run.

### The correction

The Cause section above attributes the failure to `orderGate` refusing an intent
with no `confirmedAt`, and says the benchmark "bypasses the gate". Traced, that
does not hold for this action:

- `mutatingActionOf` resolves the bulk close to `close-all-positions`
- that string is in `MUTATING_ORDER_ACTIONS` but **not** in `CONFIRMABLE_ACTIONS`
- so `confirmationPolicyStore.requiresForWireAction` returns false,
  `confirmationRefusal` returns null, and the gate approves — in the app exactly
  as in the benchmark

The omission is deliberate, and documented at the top of `closeAllFlow.ts`: a
settings toggle for a bulk close would offer a way to unguard it by accident, so
`confirmAndCloseAllPositions` asks unconditionally and states count and total
notional. The confirmation exists; it is simply not the gate's.

Recorded because `close-all-positions` missing from `CONFIRMABLE_ACTIONS` reads as
a gap to anyone who does not follow the reference into `closeAllFlow`, and it is
not one.

### What B costs

The measurement is gone. `closeAllPositions` has no benchmark, so a regression in
its cost profile would not be caught by `benchmark:technicals`. Option A would
have kept it at the price of encoding an order-confirmation path inside a
performance measurement; a third option — stub `readFreshPositions` as well —
would have kept a number that measures two mocks and no flatten. The file stays
in the tree, excluded from the benchmark project with that reasoning on it, so the
choice is visible at the point where someone would otherwise re-add it.

## Acceptance criteria

- [x] It is established which side is wrong, with the failing call traced to a
      specific condition in `tradeService` — the fixture, via `verifyFlat` →
      `readFreshPositions` → `unverified: true` → `tradeService.ts:2400`
- [~] `npm run benchmark:technicals` reports a result for
      `closeAllPositions with pre-fetch` instead of an error — superseded by
      option B. The file is excluded rather than fixed, so there is no result for
      it at all. That is the accepted cost, stated above.
- [x] If the service turns out to be at fault, that is filed separately — it is
      not at fault, and the near-miss that looked like a defect was checked
      against `closeAllFlow` and found to be a documented decision.

## Links

- BUG-0631 — the other benchmark-harness defect
- FEAT-0630 — the migration that made this visible
