---
id: BUG-0499
title: The daily loss limit measures the journal rather than the account, so four ordinary situations let a breached limit pass
type: bug
status: done
assignee: opencode
branch: fix/bug-0499-daily-loss-completeness
priority: P0
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0499 — The daily loss limit measures the journal, not the account

## Symptom

A trader sets **Max daily loss = 500 USDT**. It is the one limit whose whole
purpose is to stop a bad day from becoming a ruinous one, and it is the limit a
trader leans on hardest precisely when they are least able to judge for
themselves.

They lose 2,000 USDT today. The gate lets the next order through, and the one
after that. Nothing is broken on screen: the limit is configured, the red banner
never appears, the order is accepted.

There are at least four ordinary ways to reach that state, and none of them
involves corrupt data or unusual use.

## Evidence

**Derived, from reading the code.** The limit is enforced correctly against the
number it is given; the defect is entirely in where that number comes from.

The gate hook is wired and does fail closed — `src/services/rmsService.ts:288`:

```typescript
private checkDailyLoss(now = Date.now()): OrderRefusal | null {
    const max = riskState.limit("maxDailyLossUsdt");
    if (max === null) return null;
    const loss = this.realizedLossToday(now);
```

And `realizedLossToday` derives from `realizedPnlToday`, whose only source is
the local journal — `src/services/rmsService.ts:243`:

```typescript
for (const entry of journalState.entries) {
    if (entry.isPaper === true) continue;
    if (!CLOSED_STATUSES.has(entry.status)) continue;
    const ts = closeTimestamp(entry);
    if (ts === null || ts < dayStart || ts > now) continue;
    total = total.plus(getTradePnL(entry));
}
```

The journal is a record a trader keeps. The limit is a gate that stops orders.
Those are different jobs with different tolerances for being incomplete, and
four properties of the record become holes in the gate:

**1. A manual loss with no amount entered counts as zero.**
`src/lib/calculators/core.ts:40`:

```typescript
if (t.status === "Lost") {
    return new Decimal(t.totalNetProfit || 0);
}
```

Its comment states the intent plainly: *"If the user inputs 0 (or forgets), it
stays 0. This is intended to avoid false 'auto-calculated' losses."* That is the
right call **for statistics** — inventing a −1R loss would skew every metric.
It is the wrong call for a gate, because the same zero now means "no loss today".
A trader who marks a trade `Lost` and has not yet filled in the amount has told
the app they lost money, and the limit reads it as a flat day.

**2. Only two statuses count at all.** `src/services/rmsService.ts:58`:

```typescript
const CLOSED_STATUSES = new Set(["Won", "Lost"]);
```

`JournalEntry.status` is an unconstrained `string` (`src/stores/types.ts:171`),
not a union. Any other terminal wording — a breakeven, a partial, a liquidation,
anything a future feature or an import introduces — contributes nothing to the
day's loss and no type error says so.

**3. A close with no `exitDate` is filed under the wrong day.**
`exitDate` is optional (`src/stores/types.ts:168`), and the fallback is the
*entry* date — `src/services/rmsService.ts:214`:

```typescript
const raw = entry.exitDate || entry.date;
```

A position opened yesterday and stopped out today is therefore stamped
yesterday, falls outside `utcDayStart(now)`, and does not count against today's
limit — which is exactly the trade the limit most needed to see.

**4. Anything the journal has not learned about yet is invisible.**
A position closed by the exchange's own stop while Cachy was shut, closed from
the venue's phone app, or liquidated, reaches the journal only once a sync has
run. `checkDailyLoss` is evaluated at order time. A trader who opens the app
after a bad night and places a trade immediately is measured against a journal
that has not caught up. The sync is also Bitunix-only today (FEAT-0461), so on
Bitget this window never closes.

The UTC-day boundary itself is fine and well argued (`rmsService.ts:60-74`) —
that is not what this item is about.

## Cause

One number is being asked to serve two purposes with opposite failure
preferences. A journal should refuse to invent a loss it was not told about;
a kill limit should refuse to assume a loss did not happen. `realizedPnlToday`
inherits the journal's preference and hands it to the gate.

The deeper shape: the limit is stated in account terms ("lose no more than 500
today") but computed in record terms ("sum the entries I happen to hold"). As
long as the record is allowed to be incomplete — and it is, deliberately, in
every one of the four ways above — the gate is guessing.

## Fix

Make the gate's number honest about its own completeness, rather than trying to
make the journal complete. Sketch, in the order that matters:

1. **Separate the two readings.** Give the limit its own accessor that returns
   `{ loss: Decimal; complete: boolean }` instead of a bare `Decimal`. Keep
   `getTradePnL` exactly as it is for statistics.
2. **Count "known incomplete" as a refusal, not as zero.** A `Lost` entry with
   no amount, an entry with a status outside the known set, and a closed entry
   with no `exitDate` should each mark the day's figure incomplete. When a
   daily limit is configured and the figure is incomplete, refuse with a
   distinct reason ("cannot measure today's loss") rather than pass. The gate
   already has this vocabulary — `unmeasurable()` is used by every other limit
   in the same file, and this is the one limit that does not use it.
3. **Constrain the status.** Make `JournalEntry.status` a union so
   `CLOSED_STATUSES` cannot silently fall behind it. This is the part that
   closes the class rather than patching today's members of it.
4. **Say when the figure is stale.** Record the last successful position-history
   sync and treat a limit checked against a journal older than that sync as
   incomplete per (2).

What to leave alone: the UTC boundary, the paper-trade exclusion, and
`getTradePnL`'s refusal to invent losses. All three are right.

Point 2 is a deliberate change in failure direction and should be called out in
the UI: a trader whose journal is incomplete will now be *refused* where they
were previously allowed. That is the correct direction for a safety limit, but
it is a behaviour change, not a silent repair.

## Acceptance criteria

- [x] A test journals a `Lost` entry for today with no `totalNetProfit`, sets
      `maxDailyLossUsdt`, and asserts the next opening order is **refused**
- [x] A test journals a closed entry whose `exitDate` is today and whose `date`
      is yesterday, and asserts it counts toward today's loss
- [x] A test uses a terminal status outside `{Won, Lost}` and asserts the day's
      figure is reported incomplete rather than zero
- [x] Each test fails without the fix
- [x] A complete journal that is under the limit still passes — the change must
      not refuse ordinary trading
- [x] Closes, cancels and TP/SL modifications are still never blocked by this
      limit
- [x] `getTradePnL` still returns 0 for a manual `Lost` entry with no amount,
      and the statistics that use it are unchanged

## Links

- `docs/backlog/features/FEAT-0013-*` — the risk limits and kill switch this
  belongs to
- `docs/backlog/features/FEAT-0461-multi-broker-journal-sync.md` — why
  mechanism 4 is permanent on Bitget until that lands
- BUG-0500 — the other limit in this file that under-measures, for a different
  reason
- `src/services/rmsService.ts` — `unmeasurable()`, the pattern the daily-loss
  check should be following
