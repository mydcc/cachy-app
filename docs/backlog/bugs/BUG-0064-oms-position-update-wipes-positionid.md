---
id: BUG-0064
title: omsService.updatePosition() overwrites positionId/positionMode on partial WS pushes
type: bug
status: done
priority: P0
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: [BUG-0062, BUG-0063]
estimate: 3
size: M
target_date: 2026-08-24
---

# BUG-0064 — omsService.updatePosition() overwrites positionId/positionMode on partial WS pushes

## Symptom

Reported live, immediately after BUG-0063 (unconditional `tradeSide`/
`positionId` on close) merged and its CI passed: closing a position still
fails. The browser console still shows `POST
https://dev.cachy.app/api/orders 500 (Internal Server Error)`, and Cachy's
own error display still shows "must not be null" — the same failure
signature BUG-0063 was meant to fix.

## Evidence

**Demonstrated** — reproduced by tracing the data path BUG-0063's fix
actually depends on, not just the payload-building code itself.

BUG-0063 made `buildCloseOrderFields()` (`src/services/tradeService.ts`)
always send `positionId` — but only when `position.positionId` is actually
populated on the `OMSPosition` object `closePosition()`/
`flashClosePosition()` read from `omsService.getPositions()`. Two
independent paths write to that store:

1. `ensurePositionFreshness()` (`tradeService.ts`), which REST-fetches via
   `/api/sync/positions-pending` and calls `omsService.updatePosition(
   mapToOMSPosition(validation.data))` with a fully Zod-validated payload —
   `positionId`/`positionMode` present (BUG-0062 already fixed this path).
2. The WS position channel handler (`src/services/bitunixWs.ts:1422`),
   which calls `omsService.updatePosition(mapToOMSPosition(item))` on
   *every* push for that symbol — including partial `UPDATE` events (e.g.
   a PnL-only push) that don't repeat every field. Bitunix's WS position
   channel docs (`docs/bitunix-api/08_websocket.md:261-291`) list
   `positionId`/`positionMode` without ever confirming they're repeated on
   every push type — the same undocumented-omission pattern already
   confirmed for `qty` (BUG-0058) and order metadata (BUG-0061).

`mapToOMSPosition()` maps a missing `positionId`/`positionMode` to
`undefined` (`src/services/mappers.ts:83-86`) — correct, since it has no
notion of "previous state". The bug is in
`omsService.updatePosition()` (`src/services/omsService.ts:129`), which
used `this.positions.set(key, position)` — a **blind overwrite**, unlike
`accountState.updatePositionFromWs()` (`src/stores/account.svelte.ts`),
which already merges incoming WS fields with the existing entry via
`safeDecimal(data.field, existing.field)` for exactly this reason. Any WS
push landing between `ensurePositionFreshness()`'s REST refresh and the
user's "Close" click — very likely for an actively-traded symbol — wiped
the just-fetched `positionId`. Worse, `updatePosition()` also resets
`lastUpdated` to "now" on every call, so `ensurePositionFreshness()`'s
staleness check (>200ms) treated the now positionId-less entry as fresh
and skipped refetching it, silently reproducing the exact payload BUG-0063
was meant to eliminate.

## Cause

`omsService.updatePosition()` replaces the stored position outright instead
of merging incoming fields onto the existing entry, so a WS push that omits
`positionId`/`positionMode` deletes previously known values.

## Fix

`updatePosition()` now falls back to the existing entry's
`positionId`/`positionMode` when the incoming position doesn't carry them,
mirroring `accountState.updatePositionFromWs()`'s established merge
pattern. All other fields keep overwriting fresh on every push (intentional
— PnL, margin, etc. are genuinely live).

## Acceptance criteria

- [x] A WS push that omits `positionId`/`positionMode` preserves the
      previously known values on the stored `OMSPosition`
- [x] A WS push that *does* carry new values still overwrites (adoption of
      genuinely new data isn't blocked)
- [x] `npm run check` and the full Vitest suite pass

## Links

- `src/services/omsService.ts` — `updatePosition()`
- `src/services/mappers.ts` — `mapToOMSPosition()`
- `src/services/bitunixWs.ts:1411-1424` — position channel handler
- `docs/bitunix-api/08_websocket.md:261-291` ("Position Channel")
- `docs/backlog/bugs/BUG-0062-hedge-mode-close-position-fails.md`
- `docs/backlog/bugs/BUG-0063-close-position-500s-must-not-be-null.md`
