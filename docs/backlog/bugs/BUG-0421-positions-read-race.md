---
id: BUG-0421
title: A stale positions read can resurrect a position the trader has closed
type: bug
status: done
priority: P1
milestone: none
shipped: 1.6.0-beta.261
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [BUG-0412]
---

# BUG-0421 — A stale positions read can resurrect a position the trader has closed

## Symptom

A position the trader has just closed reappears in the positions panel, and
stays until the next successful read. Everything downstream of
`accountState.positions` sees it: the panel, the chart mirror, and the
preconditions the trade panel derives from whether a symbol is busy.

## Evidence

**Demonstrated.** `PositionsSidebar.race.component.test.ts` — "a stale response
must not resurrect a position that was closed". Without the fix it reports
`expected [ 'BTCUSDT' ] to deeply equal []`.

`fetchPositions` does guard itself:

```ts
if (loadingPositions) return;
```

but `loadingPositions` is component-local state, and the panel mounts twice —
desktop and mobile, the CSS-hidden one still mounted and still fetching. Two
instances hold two flags, neither sees the other's request, and the last
response to land wins.

This is the shape BUG-0412 fixed for `/api/account`, on data that matters
more: position size checks and the close-confirmation gate read this list.

## Cause

The same one as BUG-0412 — a per-instance lock standing in for ordering — left
in place on a second endpoint because the account race was the one that had
been observed.

## Fix

A third ordering lane, `positionsReadOrder`. Its own counter rather than
sharing the account lane, for the reason the leverage lane already documents:
a slow snapshot read must not be able to discard a positions read that started
after it.

The ticket is taken before the first `await` and claimed immediately before
each write — the success path, the error path, and the paper branch, matching
`fetchAccount`.

## Acceptance criteria

- [x] A test mounts two instances, lands the fresh response first and the stale
      one last, and asserts the closed position stays closed
- [x] The test fails with the guard removed and passes with it in place
- [x] Positions get their own lane, not the account lane
- [x] Error and paper paths are ordered too, not only the success path
- [x] The existing BUG-0412 tests are untouched

## Links

- [BUG-0412](BUG-0412-duplicate-sidebar-account-fetch-race.md) — the same defect on `/api/account`
- [FEAT-0011](../features/FEAT-0011-preflight-order-verification.md) — reads this list before a close
