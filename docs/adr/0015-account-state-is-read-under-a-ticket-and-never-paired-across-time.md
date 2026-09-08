# ADR-0015: Account state is read under a ticket and never paired across time

- **Status:** Proposed
- **Date:** 2026-09-07
- **Deciders:** Pat, with the fixes in #2750, #2751, #2752, #2757–#2760

## Context

Four bugs in the trade panel turned out to be one defect wearing different
clothes. Each was fixed on its own before the shape was clear:

- **BUG-0412** — two mounted `PositionsSidebar` instances read `/api/account`
  concurrently; the last response to land won, including a stale one.
- **BUG-0410** — the position mode reached the store only through a mounted
  sidebar, so `requestSync()` was a silent no-op without one.
- **BUG-0409** — the chip paired a margin mode and a position mode fetched on
  different triggers, displaying `Cross • Hedge`, a combination no venue ever
  reported.
- **BUG-0421** — the same race as BUG-0412 on `/api/positions`, where a stale
  read could resurrect a closed position.

The common shape: an invariant spread across two things — a value and its
freshness, a response and its ordering — held together only by every author
remembering. Three parts of that are now mechanised:

- `src/stores/account.svelte.ts` — `positionMode` and `positionModeAt` are
  private with getters; the pair can only be written by `setPositionMode`.
- `scripts/audit-account-state.mjs` — CI fails on a direct assignment, and
  self-tests its own pattern so it cannot rot into a meaningless green tick.
- `src/services/accountReadOrder.ts` — a branded `AccountReadTicket` that
  call sites cannot mint themselves.

What follows is the part no type and no scan can enforce, written down because
it is otherwise carried only in comments beside the code that already obeys it.

## Decision

**1. Every read that writes account state takes a ticket before its first
`await`, and claims it immediately before the write.**

```ts
const ticket = someReadOrder.begin();   // before the first await
// ... fetch, parse ...
if (!someReadOrder.mayApply(ticket)) return;   // immediately before the write
```

The ticket records when the read *started*; `mayApply` refuses one that is
older than a read already applied, and one whose account session has rotated.
It returns true at most once per ticket, so the claim must sit at the write and
nowhere earlier — a read that produced nothing to apply leaves the slot to
whoever did. The error path is a write too: a stale failure must not clear a
fresher snapshot.

**2. Each endpoint gets its own lane.**

`accountReadOrder`, `leverageReadOrder`, `positionsReadOrder`. Ordering asks
"is this answer older than one already applied *to this field*". Two endpoints
that describe different fields must not share a counter, or a slow read of one
silently discards a fresh read of the other — a symptom that looks exactly like
the bug the ordering exists to fix. A new endpoint that writes account state
gets a new lane.

**3. Two values are never displayed as a pair unless they share a moment.**

Each half carries the stamp of the read that produced it. Where a component
shows two halves side by side it compares the stamps, and shows the older half
as unknown rather than pairing them (`MODE_PAIR_MAX_SKEW_MS` in
`ExchangeAccountControls.svelte`). A stamp belongs to a **read**, not to a
field: `remoteLeverage` and `remoteMarginMode` share `remoteAccountStateAt`
because they arrive in one response, and splitting that would claim they can be
different ages when they cannot.

**4. Switching the trading mode is an account switch.**

Paper and live are different accounts: different book, different leverage,
different fees. Both halves of the account state are cleared on the way in and
on the way out (`accountState.reset()` *and*
`tradeState.clearRemoteAccountState()`).

## Consequences

### What this enables

A new reader of account state has one page to check rather than four bug
reports to read. A reviewer can point at rule 1 or rule 2 instead of arguing
from memory about what a previous fix intended.

### What this costs

Every new account-state read is three lines longer than the obvious version,
and the ticket must be taken at a spot that looks arbitrary until you know why
(before the first `await`, not at the write). The lane-per-endpoint rule means
a new endpoint needs a decision that a shared counter would not — and the wrong
choice is invisible in testing, because a single-instance run never races.

Rule 3 costs display availability: a half that has drifted is blanked rather
than shown, so a trader sometimes sees `—` where a value exists but is old.
That is the intended trade — an honest gap beats a plausible pairing.

### What is now forbidden

- Writing `accountState.positionMode` or `positionModeAt` from outside the
  store. The compiler and CI both refuse it.
- Claiming an ordering ticket anywhere but immediately before a write.
- Sharing one ordering lane between two endpoints.
- Displaying two account-state values as a pair without comparing their stamps.
- Clearing one half of the account state on a switch without the other.

## Alternatives considered

**Single-flight the reads instead of ordering them.** Coalescing concurrent
requests removes the race by removing the concurrency, and is still worth doing
for traffic. It was rejected as the *primary* mechanism because it makes the
scenario the regression test pins unreachable — two mounts, one request — so
the test proving the fix would have to be rewritten to prove something weaker.
Ordering is the property; deduplication is an optimisation on top.

**One stamp per field rather than per read.** Rejected: it would imply
`remoteLeverage` and `remoteMarginMode` can be different ages. They arrive in
one response. Granularity finer than reality is also a lie.

**Document the protocol in comments only.** That is what the code did before
this ADR, and it produced four bugs of one shape fixed four times. Comments
travel with the code that already obeys the rule, not with the code about to
break it.

**Encapsulate everything, including the verifying flags.**
`positionModeVerifying` and `marginModeVerifying` stay public: they carry no
truth value and no stamp, so there is no pair to break, and a setter around a
`try/finally` would be ceremony. Recorded so the omission reads as a decision.
