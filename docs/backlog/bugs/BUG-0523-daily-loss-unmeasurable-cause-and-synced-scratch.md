---
id: BUG-0523
title: Daily-loss unmeasurable refusal names no cause and synced scratch trades brick the day
type: bug
status: in-progress
assignee: opencode
branch: fix/bug-0523-daily-loss-followups
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0523 — Daily-loss unmeasurable refusal names no cause and synced scratch trades brick the day

Follow-up of BUG-0499 (Paket B depth review). Fail-closed direction is kept;
this is about false positives and actionability, not about protection holes.

## Symptom

1. A trader with `maxDailyLoss` configured whose day is unmeasurable gets
   `orderGate.riskLimitUnmeasurable` — "carries nothing to measure it
   against" — with no word on which of the four causes applies or what to
   do. The concrete remedy lives only in a settings tooltip.
2. Every exact-breakeven synced close (`Lost` + amount 0, auto-written by
   the Bitunix history sync) marks the day incomplete, refusing all
   opens/adds until the trader hand-edits an auto-written row to `Won`.

## Evidence

**Derived.**

- `assessDailyLoss` (`src/services/rmsService.ts`) returns `{loss, complete}` —
  the cause is computed and discarded; `checkDailyLoss` maps every
  incomplete day to one generic key.
- `hasRealisedAmount` treats 0 as missing for all rows, but sync writes
  actual venue figures (`src/services/syncService.ts` history rows:
  `status = netPnl > 0 ? Won : Lost`, `totalNetProfit = netPnl`). A recorded
  synced zero is a measured zero; a hand-typed zero usually means
  "never entered". The gate cannot tell them apart today.

## Cause

See Evidence. Manual 0 stays "forgotten" (fail-safe); synced 0 becomes
"measured". Nothing in the statistics path changes — gate reading only.

## Fix

- Source-aware amount check: `isManual === false` rows with a present,
  finite amount (zero included) count as measured; manual rows keep the
  strict zero-as-missing reading. Fully absent amounts stay incomplete on
  both paths.
- `DailyLossAssessment` gains the first incomplete cause
  (`no-amount` / `no-exit-date` / `unknown-status` / `stale-sync`);
  `checkDailyLoss` maps it to a dedicated key with the remedy in the
  message. Null cause with incomplete stays on the generic key (belt).
- Message keys in both locales; hint text adjusted to the manual-only
  scratch rule.

## Acceptance criteria

- [ ] A synced `Lost`/`Closed` row with amount 0 keeps the day complete
      (fails before, passes after)
- [ ] A manual `Lost`/`Closed` row with amount 0 still refuses the day
- [ ] Each of the four causes yields its own message key (test-asserted)
- [ ] EN + DE parity; other `unmeasurable` callers untouched
- [ ] Statistics (`realizedPnlToday` consumers) unchanged

## Out of scope

- Venue rounding of tiny losses to exactly 0.00 — verified at
  implementation: the sync builds `netPnl` from raw venue strings through
  exact `Decimal` arithmetic (`syncService.ts`, no truncation in storage;
  rounding happens only at display), so a stored 0 is a true zero. Residual:
  a history row with all pnl fields absent coerces to 0 via `|| 0`
  (pre-existing sync behaviour) — bounded, requires a row with no pnl data
  at all.
- Empty/never-synced journals (blind by design, local-first)
- `Won`/0 status lying (undetectable, accepted)

## Links

- [`BUG-0499`](BUG-0499-daily-loss-limit-measures-the-journal-not-the-account.md) — parent fix
- `src/services/rmsService.ts` — `assessDailyLoss`, `hasRealisedAmount`, `checkDailyLoss`
