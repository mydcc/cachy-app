---
id: BUG-0060
title: PositionsSidebar reads /api/positions and /api/account through the wrong response envelope
type: bug
status: done
priority: P0
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: none
adr: none
depends_on: []
---

# BUG-0060 — PositionsSidebar reads `/api/positions` and `/api/account` through the wrong response envelope

## Symptom

Root cause of everything reported while chasing BUG-0058/BUG-0059: with a
real open position on the exchange, the Positions tab stayed empty and
Account Summary showed every field at zero, with no error message anywhere
— even after BUG-0059 added error surfacing for exactly this failure mode.
The position only ever appeared after a WS position push (e.g. triggered by
editing the position on the exchange), and then only with the fields a WS
push carries (size, entry, side, PnL) — REST-only fields
(`liquidationPrice`, `markPrice`, `marginRate`) stayed unset.

## Evidence

**Demonstrated.** The reporting user captured the actual `/api/positions`
response via the browser Network tab:

```json
{
  "success": true,
  "data": {
    "positions": [
      {
        "positionId": "662491704776252252",
        "symbol": "XRPUSDT",
        "side": "LONG",
        "size": "9.1",
        "entryPrice": "1.0434",
        "liquidationPrice": "0.9441",
        "margin": "0.9540751212993",
        "unrealizedPnL": "0.02639",
        "marginRate": "0.0486",
        "realizedPnl": "-0.0052172855007",
        "leverage": "10",
        "marginMode": "isolated"
      }
    ]
  }
}
```

This is a **complete, well-formed, correct** response — the server-side
data pipeline (all of BUG-0055/FEAT-0057's work) was never broken. The bug
is entirely in how `PositionsSidebar.svelte` read this response:

```ts
const data = await response.json();
if (data.error) errorPositions = translateError(data);
else if (data.positions) {
  accountState.hydratePositions(data.positions);
}
```

`data.error` is `undefined` (the array shown above has no top-level
`error` key) — so the first branch never fires — and `data.positions` is
*also* `undefined`, because the real array lives at `data.data.positions`,
not `data.positions`. **Both branches miss.** Nothing happens: no error,
no data, `accountState.positions` stays empty forever, indistinguishable
from "no open positions."

`/api/positions/+server.ts` and `/api/account/+server.ts` both return
their success/error payloads through `jsonSuccess`/`jsonError`/
`handleApiError` (`src/utils/apiResponse.ts`), which wrap everything as
`{ success: true, data: T }` or `{ success: false, error: { code, message,
details } }`. `PositionsSidebar.svelte`'s four fetchers were written
against the *other* format still used by `/api/orders` (`{ orders }` /
`{ error }` flat, via plain `json(...)` calls) — `fetchPendingOrders()` and
`fetchHistoryOrders()` happen to be correct because that route never
switched envelopes; `fetchPositions()` and `fetchAccount()` were wrong for
the exact same reason `fetchHistoryOrders()` is right.

## Cause

Two response conventions coexist in `src/routes/api/`: the newer
`jsonSuccess`/`jsonError` envelope (`/api/positions`, `/api/account`,
`/api/sync/*` — `syncService.ts` already reads these correctly via
`.data`) and the older flat shape (`/api/orders`, still plain `json(...)`).
`PositionsSidebar.svelte` was written for the old shape and never updated
when `/api/positions`/`/api/account` moved to the new one — nothing
enforced consistency between a route's actual response shape and its sole
client consumer.

## Fix

Added `unwrapApiEnvelope<T>()` (`src/utils/utils.ts`) — a small, unit-tested
helper that reads the `{ success, data }` / `{ success, error }` shape
correctly — and switched `fetchPositions()`/`fetchAccount()` to use it.
`fetchPendingOrders()`/`fetchHistoryOrders()` are untouched; their route
still returns the flat shape they already handle correctly.

Deliberately not fixed here (separate, not yet root-caused): closing an
open position from the Positions tab reportedly does nothing with no error
shown, and some cancelled orders in History render as "UNKNOWN BUY/SELL".
Both go through different code paths (`tradeService.ts`'s `omsService`-
based position tracking, and `/api/orders`' history mapping respectively)
and need their own investigation.

## Acceptance criteria

- [x] A test (`unwrapApiEnvelope` in `utils.test.ts`) reproduces unwrapping
      the exact response body captured from the live report
- [x] `fetchPositions()` populates `accountState.positions` from a real
      `{ success: true, data: { positions } }` response
- [x] `fetchAccount()` populates `accountInfo`/`accountState.assets` from a
      real `{ success: true, data: {...} }` response
- [x] An error response (`{ success: false, error: {...} }`) surfaces a
      translated message via `errorPositions`/`errorAccount`
- [x] `npm run check` and the full Vitest suite pass

## Links

- [`BUG-0058`](BUG-0058-ws-position-update-missing-qty-closes-position.md),
  [`BUG-0059`](BUG-0059-account-fetch-error-silently-swallowed.md) — the
  reports that led here
- `src/components/shared/PositionsSidebar.svelte` — `fetchPositions()`,
  `fetchAccount()`
- `src/utils/utils.ts` — `unwrapApiEnvelope()`
- `src/utils/apiResponse.ts` — `jsonSuccess`/`jsonError`/`handleApiError`
- `src/services/syncService.ts` — the other client already reading this
  envelope correctly
