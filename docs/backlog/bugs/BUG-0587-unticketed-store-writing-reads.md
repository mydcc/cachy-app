---
id: BUG-0587
title: Two store-writing exchange reads carry no read ticket, so a late response re-stamps the account after a switch
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: fix/bug-0587-unticketed-reads
---

# BUG-0587 — Two store-writing reads have no session or ordering guard

## Symptom

Two exchange reads write directly into the account store with nothing to check
whether the account or mode is still the one that asked. A response that
arrives after the trader switches account or flips live→paper stamps the old
account's positions, or live positions, into the new session's store.

That is BUG-0565, fixed on 2026-09-26 by stamping a provenance mode on every
write. The stamp is present, but on these two paths nothing consults it, so the
late write is accepted.

## Evidence

**Derived** — read directly, and the contrast with the guarded siblings in the
same files is the evidence.

**`PositionsSidebar.svelte`, `fetchPendingOrders` (~line 396)** hydrates with
no ticket:

    async function fetchPendingOrders() {
        … paper branch …
        accountState.hydrateOpenOrders(data.orders || [], "live");   // line ~435

Its sibling in the **same file**, `fetchPositions` (~line 322), does it
properly:

    const ticket = positionsReadOrder.begin();
    …
    if (!positionsReadOrder.mayApply(ticket)) return;    // :373
    …
    if (!positionsReadOrder.mayApply(ticket)) return;    // :378
    accountState.hydratePositions(data.positions, "live");

**`tradeService.ts`, `readFreshPositions` (~line 2135-2153)** — the read that
backs **close-all verification** — hydrates with nothing at all:

    const response = await exchangeSignedFetch({ … fetchFn: appFetch });
    const { data } = unwrapApiEnvelope<{ positions: NormalizedPosition[] }>(json);
    if (data === null || !data.positions) throw new Error(TRADE_ERRORS.FETCH_FAILED);
    accountState.hydratePositions(data.positions, "live");

No `begin()`, no `mayApply`, no `accountEpoch.isCurrent`. The comment at
`tradeService.ts:159-176` deliberately leaves read lanes on bare `appFetch`
because a cross-boundary read is stale rather than dangerous — that reasoning
covers not *sending* the request, and does not address writing the answer into
shared state.

Two consequences, both real:

- **Account switch.** The previous account's positions land in the store under
  the new account. On the close-all path that means the confirmation is built
  from the wrong book. (The sizing itself is re-read at `tradeService.ts:2327-2329`,
  which bounds the damage, but the state the trader is shown is wrong.)
- **Live→paper switch.** The snapshot is re-stamped `"live"` while paper is
  active, so `readUsdtBalance("paper")` returns `undefined` and the gate takes
  its unmeasured path — a skip for a reduction, a refusal for an add
  (`rmsService.ts:540-545`). Fail-closed for money, but a spurious block and a
  chart showing real positions against simulated equity.

The paper simulator re-stamps `"paper"` on its next sync tick, so the window is
bounded. That is a mitigation, not a fix.

## Cause

The guard was applied per call site rather than to the store-writing path, so
each new or re-discovered reader has to remember it. Two were missed, one of them
in a file the same commit edited.

## Fix

Give `fetchPendingOrders` and `readFreshPositions` the same
`ReadOrder.begin()` / `mayApply(ticket)` treatment their siblings have, taking
tickets from the appropriate order (`positionsReadOrder`, and the account order
for the close-all read).

Then check the wider set rather than stopping at these two:
`CandleChartView.svelte:369` and `:406` also call
`hydratePositions`/`hydrateOpenOrders` with `"live"` and appear to have no
ticket either. Verify each and either guard it or record why it does not need
one.

Prefer closing the class over the instances: consider having the `hydrate*`
functions require a ticket, so an un-ticketed write is a type error rather than
a review comment.

## Acceptance criteria

- [x] A test reproduces a late response landing after an account switch and
      fails without the fix
- [x] A second test covers the mode-switch case
- [x] Every `hydratePositions` / `hydrateOpenOrders` / `hydrateBalance` call
      site in `src/` is enumerated, and each is either guarded or has a written
      reason it does not need to be
- [x] `tradeService.readFreshPositions` is guarded, being the money path

All four are met. `PositionsSidebar.race.component.test.ts` 5/5, `accountReadOrder`
6/6, `tradeService` 200/200, `account.test.ts` green. The race test is the one
that matters and it has a real control — "without a session rotation the live
snapshot is applied", asserting `length === 1` — so the empty-list assertion
cannot pass because the rotation cleared the store. `accountEpoch.rotate()`
increments a counter and does not clear the store, so the test is not vacuous.

The 14 `hydrate*` call sites are inventoried in the fix's own commit message;
each is either behind a read ticket or has a written reason it does not need one.

## Out of scope

- **No lock, no abort, no cancellation.** A late response is dropped, not
  applied-then-corrected. Nothing waits on a read
- No change to `hydratePositions` itself or to how the store decides which
  snapshot is newer. The ticket decides *whether to apply*, not what to apply
- **The `evictMirroredGhosts` gap is real and stays open.** `verifyFlat` hands
  the possibly-stale list to a second store mutation outside the gate this fix
  adds. The gate covers the `leftover` verdict, not the eviction. Not closed
  here because narrowing it changes what a close-all can prove
- No work on BUG-0565's incomplete provenance stamping, which this fix depends
  on but does not finish
- No i18n or UI change

## Links

- BUG-0565 — the provenance stamping this depends on, and the item whose fix is
  incomplete here
- BUG-0419, BUG-0421 — earlier read-race items in the same family, both `done`
