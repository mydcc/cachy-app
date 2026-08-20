---
id: BUG-0062
title: Closing a position 500s on a HEDGE-mode account (missing tradeSide/positionId)
type: bug
status: done
priority: P0
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
start_date: 2026-08-08
target_date: 2026-08-13
size: M
estimate: 3
---


# BUG-0062 — Closing a position 500s on a HEDGE-mode account (missing tradeSide/positionId)

## Symptom

Reported live: clicking "Close" on an open position in the Positions tab
does nothing visible. The browser console shows `Failed to load resource:
the server responded with a status of 500 (Internal Server Error)`.
Cancelling a pending order (Orders tab) works fine with the same account.

## Evidence

**Demonstrated + confirmed against Bitunix's documented API contract.**

The reporting account is in **HEDGE** mode (confirmed via the Account
Summary tooltip's "Mode: HEDGE", already fixed by BUG-0060). Bitunix's
`Place Order` endpoint documents (`docs/bitunix-api/07_trade.md:583-584`):

| Parameter | Required | Description |
|---|---|---|
| `tradeSide` | **Nur im Hedge-Modus erforderlich** | `OPEN`/`CLOSE`. Close Long: `side=BUY, tradeSide=CLOSE`. Close Short: `side=SELL, tradeSide=CLOSE` |
| `positionId` | Required when `tradeSide=CLOSE` | identifies *which* position — a HEDGE-mode symbol can carry both a long and a short position at once |

Neither `closePosition()` nor `flashClosePosition()`
(`src/services/tradeService.ts`) ever sent `tradeSide` or `positionId` —
and both used the ONE_WAY-only `side` convention (the *inverted* execution
direction: close-long → `SELL`) unconditionally, which is the wrong value
for `side` in HEDGE mode too (there it identifies the position, not the
trade direction — `side=BUY` for closing a **long**). Bitunix legitimately
rejects an order missing required fields; that rejection was thrown as an
`Error` in `placeBitunixOrder()` (`src/routes/api/orders/+server.ts`) and
caught by the route's outer handler, which converts **any** thrown error —
a genuine bug or an expected exchange-side rejection alike — into an HTTP
500 with the real reason in the (JSON) body.

A second, independent bug hid the diagnosis: `handleClosePosition()`
(`src/components/shared/PositionsSidebar.svelte`) had a bare `catch {}`
that discarded the caught error entirely and always showed a fixed generic
toast — the exchange's actual rejection reason was never visible, even
though the sibling `handleCancelOrder()` already used
`getDisplayMessage(e)` correctly for the same class of error.

A third gap made the fix impossible without first fixing the data path:
`positionId`/`positionMode` are present on Bitunix's raw position payload
(REST and WS) but were dropped at **two** points before reaching
`tradeService.ts`: `PositionRawSchema` (`src/types/apiSchemas.ts`) didn't
declare either field (Zod silently strips undeclared keys), and
`OMSPosition` (`src/services/omsTypes.ts`) had no fields for them either —
so even a correct `mapToOMSPosition()` would have had nothing to map.

## Fix

1. `PositionRawSchema`: added `positionId`/`positionMode`.
2. `OMSPosition`: added `positionId?: string` and
   `positionMode?: "one_way" | "hedge"`.
3. `mapToOMSPosition()`: maps both, normalizing `positionMode` to
   lowercase.
4. `PlaceOrderSchema` / `BitunixOrderPayload`: added optional
   `tradeSide`/`positionId`.
5. `/api/orders/+server.ts`'s place-order branch: forwards both to
   `placeBitunixOrder()`.
6. `tradeService.ts`: new `buildCloseOrderFields()` computes the correct
   `side` (and `tradeSide`/`positionId` when applicable) from
   `position.positionMode` — **only** switches to the HEDGE-mode shape when
   `positionMode === "hedge"` is confirmed; falls back to the original
   ONE_WAY-only behavior (inverted `side`, no `tradeSide`/`positionId`)
   whenever the mode can't be determined, since that was the only shape
   this ever sent and must not silently change for accounts already working
   correctly. Used by both `closePosition()` and `flashClosePosition()`.
7. `handleClosePosition()`: uses `getDisplayMessage(e)` instead of
   discarding the caught error, matching `handleCancelOrder()`.

## Acceptance criteria

- [x] `closePosition()`/`flashClosePosition()` send `side` matching the
      position (not inverted) plus `tradeSide: "CLOSE"` and `positionId`
      when `positionMode === "hedge"`
- [x] Both send the original inverted-`side`-only shape, with no
      `tradeSide`/`positionId`, when `positionMode` is unknown (regression
      guard — must not change behavior for the case that was already
      working)
- [x] `PositionRawSchema` preserves `positionId`/`positionMode` through
      parsing
- [x] `/api/orders` forwards `tradeSide`/`positionId` to Bitunix when
      provided, and omits both entirely when not
- [x] A close failure shows the exchange's actual message, not a fixed
      generic string
- [x] `npm run check` and the full Vitest suite pass

## Links

- `src/services/tradeService.ts` — `buildCloseOrderFields()`,
  `closePosition()`, `flashClosePosition()`
- `src/services/mappers.ts`, `src/services/omsTypes.ts`
- `src/types/apiSchemas.ts` — `PositionRawSchema`
- `src/types/orderSchemas.ts` — `PlaceOrderSchema`
- `src/routes/api/orders/+server.ts`
- `src/components/shared/PositionsSidebar.svelte` — `handleClosePosition()`
- `docs/bitunix-api/07_trade.md:564-619` ("Place Order")
