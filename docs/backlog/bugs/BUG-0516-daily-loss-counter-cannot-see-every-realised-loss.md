---
id: BUG-0516
title: The daily-loss counter recognises two hardcoded status strings and dates a close by its open day when exitDate is absent, so realised losses go uncounted in both directions
type: bug
status: done
assignee: opencode
branch: fix/paket-d-limits-close
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
---

# BUG-0516 — The one limit an add has, measured from an unconstrained string

## Why this matters more than its size suggests

`checkDailyLoss` is the only risk limit `checkLimits` applies to an add
(`rmsService.ts:277`): *"An add gets the one limit that needs no size/stop
pair."* `BUG-0508`, `BUG-0510` and `BUG-0511` between them establish that the
other ceilings do not run on the add path, or approve when they cannot measure.
So the daily-loss counter is the last one standing there — and it is built on
two assumptions that the types do not enforce.

## Mechanism 1 — two magic strings against an unconstrained type

`rmsService.ts:58`:

```ts
const CLOSED_STATUSES = new Set(["Won", "Lost"]);
```

`JournalEntry.status` is declared `status: string` (`src/stores/types.ts`). Not
a union, not an enum — any string at all. The counter recognises exactly two of
them.

Every other closed status is invisible to the limit while representing real
money: a break-even trade, a partial scale-out recorded under its own status, a
value written by a sync path, a value that gets renamed or localised. Nothing in
the type system objects, no test can enumerate the cases, and the failure is
silent in the permissive direction — an unrecognised status means *no loss
counted*, never a false refusal.

## Mechanism 2 — a close dated by its open day

`rmsService.ts:79`:

```ts
/** When a journal entry's result became real. */
function closeTimestamp(entry: JournalEntry): number | null {
    const raw = entry.exitDate || entry.date;
    ...
}
```

`exitDate` is optional, and its declaration says what it was added for:

```ts
exitDate?: string; // New field for duration calculation
```

It was introduced to compute a holding duration, and `closeTimestamp`
repurposes it as the authoritative moment money changed hands. When it is
absent — an entry written before the field existed, a manually entered trade, a
sync path that does not set it — the fallback is `entry.date`, the day the trade
was *opened*.

`realizedPnlToday` then filters `ts < dayStart || ts > now`. So:

| trade | `exitDate` | dated as | counted today? |
|---|---|---|---|
| opened and closed today | set | today | yes — correct |
| opened yesterday, closed today | set | today | yes — correct |
| **opened yesterday, closed today** | **absent** | **yesterday** | **no — the loss vanishes** |
| opened today, closed today | absent | today | yes — correct by accident |

The failing row is the ordinary case for any swing trade, and the error is again
in the permissive direction. A trader who loses their daily limit on a position
carried overnight has a counter that reads zero, and the limit that would have
stopped the next add never fires.

## What is correct here, and worth keeping

The surrounding code is careful, which is why these two gaps stand out rather
than blend in:

- The UTC day boundary is argued explicitly against DST and reproducibility, and
  the UI shows the next reset in local time (`utcDayStart`, `rmsService.ts:74`).
- Paper trades are excluded by an explicit `isPaper === true` check, with a
  written note that an incidental exclusion is one refactor away from being no
  exclusion — exactly the reasoning this item applies to `status`.
- `ts > now` guards a future-dated entry.
- Limits deliberately do not apply to closes, so a breach cannot trap a trader
  in a position.

## Relationship to BUG-0499

`BUG-0499` is about the *source*: the limit measures the journal rather than the
account. This item is about the *measurement* within that source — which
journal entries the counter can see at all. Fixing `BUG-0499` by reading the
account would make this item moot; fixing it by keeping the journal as the
source makes this item load-bearing. Either way the two are separate decisions
and should not be merged.

## Acceptance Criteria

- [ ] `JournalEntry.status` is a union or enum of the statuses the app actually
      writes, so a new one cannot be added without the compiler naming every
      place that switches on it — `CLOSED_STATUSES` included.
- [ ] Every status that represents a finished trade is counted, break-even
      included; a status the counter does not recognise is logged rather than
      silently skipped.
- [ ] The close time comes from a field whose purpose is the close time. If
      `exitDate` is to serve that role, its comment says so and the writer
      guarantees it is set whenever a status becomes closed.
- [ ] When no close time is available, the entry is not silently attributed to
      its open day — it counts against today, or it is surfaced as unmeasurable
      the way `unmeasurable()` already does for other inputs.
- [ ] Regression test: a Won/Lost entry with no `exitDate` whose `date` is
      yesterday — assert its loss reaches today's counter or is reported.
- [ ] Regression test: a closed entry under a status outside the set — assert it
      is counted or logged, not dropped.

## Out of Scope

- `BUG-0499`'s journal-versus-account question.
- `BUG-0500`'s before-fees measurement in `checkLossPerTrade`, a different
  limit.
- Journal statistics display (win rate, R multiples). This item only concerns
  the entries the risk counter reads.

## Verification note (already fixed — no code changed in Paket D)

Implemented by BUG-0499/BUG-0523 plus the journal hardening around them;
verified green on `fix/paket-d-limits-close` without touching code:

- Status union: `JournalStatus` (`src/lib/journalStatus.ts:27`), re-exported
  through `src/stores/types.ts`; `CLOSED_JOURNAL_STATUSES` shared with the
  gate; unknown wordings coerce to `"Closed"` on load/import and trip the
  `unknown-status` completeness cause at the gate.
- Close-time field: `exitDate` documented as the close day
  (`src/stores/types.ts`); writers stamp it on open→closed transitions
  (`src/stores/journal.svelte.ts`, pinned by `journal_persistence.test.ts`).
- No silent open-day attribution: a closed entry without `exitDate` marks the
  day `no-exit-date` incomplete instead of counting under the open day.
- Covering tests in `src/services/rmsService_riskLimits.test.ts`: unknown
  status refused, no-exitDate refused, overnight close attributed to
  `exitDate`.
