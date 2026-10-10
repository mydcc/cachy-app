---
id: BUG-0661
title: Post-drag TP/SL refetch is swallowed by an in-flight fetch, chart reverts to stale stop
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: chart
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0661 — Post-drag TP/SL refetch is swallowed by an in-flight fetch, chart reverts to stale stop

## Symptom

After a TP/SL drag modify **succeeds** (success toast fires), the chart
line can snap back to the **old** trigger price while the venue holds
the new one. Nothing on the chart says the display is stale —
`tpSlState.error` is only rendered in `TpSlList.svelte:58`, not on the
chart — so the trader sees a stop level that is not the resting one.

## Evidence

**Derived** from code reading; not yet reproduced live.

- `src/stores/tpsl.svelte.ts:194-196` — `ensureFresh` returns the
  in-flight request without refetching:
  `if (this.inFlight) return this.inFlight;`
- `src/stores/tpsl.svelte.ts:267-269` — `invalidate()` only nulls
  `_loadedAt`; it does not clear or order the in-flight request.
- Caller `src/lib/windows/implementations/CandleChartView.svelte:882-888`
  — the `finally` after every drag calls `invalidate()` then
  `ensureFresh(Date.now())`, which hits the early return while a
  pre-mutation fetch is in flight.
- The in-flight closure then writes pre-mutation rows into `_orders`
  and stamps `_loadedAt`, so the stale rows count as fresh for the next
  30 s (`MAX_AGE_MS`). Fetch sources that widen the window: the chart
  `$effect` calls `ensureFresh()` on every run (`:1417`), plus
  `invalidate()` calls from `closeAllFlow.ts:119/128` and
  `orderPlacementService.ts:508`.

## Cause

Cache invalidation and request lifecycle are decoupled: invalidating
does not cancel or generation-guard the outstanding request, so a stale
response overwrites the post-mutation state.

## Fix

Make the post-mutation read unconditional and generation-ordered, e.g.
`invalidate()` bumps a request generation counter that the in-flight
closure checks before writing `_orders`, and `ensureFresh` takes a
`force` flag the drag `finally` passes so it never early-returns on
`inFlight`. Surface `tpSlState.error` on the chart when a
post-mutation refetch fails, so "venue updated, display stale" is
visible rather than silent.

**Done (opencode).** Both halves, as described:

- `invalidate()` bumps a `generation` counter; `ensureFresh` captures it
  on the way out and drops the response — data *and* error — if a newer
  read has superseded it. Cancelling the request was not an option:
  there is no abort signal on this path, so refusing the write-back is
  the cheaper guard.
- `ensureFresh(now, force)` takes a `force` flag; the drag's `finally`
  passes it, so a post-mutation read never joins an in-flight one. All
  five other call sites pass nothing and keep the collapse behaviour.
- `CandleChartView` renders `tpSlState.error` as a banner over the
  chart (`role="status"`, `chartView.tpSlStale` in both locales).

`reset()` bumps the generation too: it is the account boundary, so a
request issued against the account being dropped must not write its rows
— or its error message — into the fresh store.

The request body starts through `Promise.resolve().then`, so it cannot
run before `inFlight` has been assigned. `bitunixAdapter.fetchTpSlOrders`
is a non-async arrow, so a synchronous throw is not structurally
impossible; without that hop it would run `finally` while `request` was
still in its temporal dead zone, replacing the real error with a
ReferenceError and leaving `inFlight` permanently rejected.

**`orderPlacementService.readOrders` (`:508`) after review.** It had
the same shape — `invalidate()` then a non-forced `ensureFresh()` — and
its comment already claimed to bypass the cache window, which a
non-forced read does not do while a request is in flight. Left alone it
would have become a *regression from this fix*: the generation bump
dooms the in-flight request, the non-forced read joins that doomed
request, and the confirmation sees rows from before the placement it is
checking — burning a retry attempt and, on the last one, reporting a
protected position as unprotected. It now passes `force`, which is what
its own docstring always claimed. Still `area: execution`: 👤 human
review recommended.

**Banner wording.** The chart banner does not interpolate
`tpSlState.error`. That string is not a sentence — `tpSlService` throws
i18n keys (`dashboard.alerts.noApiKeys`, `apiErrors.generic`), so
interpolating it would put `…failed: dashboard.alerts.noApiKeys` on
screen. `TpSlList` already declines to interpolate for the same reason.
Presence is the signal; the reason stays in the TP/SL tab where it can
be translated.

## Acceptance criteria

- [x] A test with an in-flight fetch at drop time reproduces the defect
      and fails without the fix (stale rows stamped fresh)
- [x] The test passes with the fix — the post-mutation read wins, no
      stale stamp
- [x] A failed post-mutation refetch is visible on the chart, not only
      in the TP/SL tab

## Links

- BUG-0660 (the drag path whose `finally` triggers this)
