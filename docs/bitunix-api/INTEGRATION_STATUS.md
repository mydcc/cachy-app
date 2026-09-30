# Bitunix API – integration status in Cachy

Reconciliation of the official Bitunix Futures API (crawled 08.08.2026, see
[README.md](README.md)) against the actual integration state in the code.
Reconciled on: **2026-09-28**.

Purpose: basis for the trade panel UI rework and the planned trade execution
(Bitunix first, then Bitget). Not a plan document — what gets built when is in
`docs/MILESTONES.md` / `docs/backlog/`.

**Legend:** ✅ integrated · 🟡 partial · ❌ not integrated

---

## Architecture summary

All Bitunix REST calls go through the SvelteKit proxy routes
(`src/routes/api/*`), signed with `generateBitunixSignature`
([src/utils/server/venues/bitunix.ts](../../src/utils/server/venues/bitunix.ts)).
On the client side, [tradeService](../../src/services/tradeService.ts)
(trading actions), [apiService](../../src/services/apiService.ts) (market
data) and [syncService](../../src/services/syncService.ts) (journal sync) wrap
the calls. WebSocket: [bitunixWs.ts](../../src/services/bitunixWs.ts) (public
+ private including login, reconnect, resubscribe).

---

## 1. REST endpoints

### Account (`02_account.md`)

| Endpoint | Purpose | Status | Code |
|---|---|---|---|
| `GET /api/v1/futures/account` | Balance, frozen, margin, transfer, positionMode, cross/isolation UPNL, bonus | ✅ | [routes/api/account](../../src/routes/api/account/+server.ts), [routes/api/balance](../../src/routes/api/balance/+server.ts) |
| `GET …/account/get_leverage_margin_mode` | Read leverage and margin mode per symbol | ✅ | [routes/api/leverage-margin-mode](../../src/routes/api/leverage-margin-mode/+server.ts) |
| `POST …/account/change_leverage` | Change leverage (per symbol) | ✅ | [routes/api/account-settings](../../src/routes/api/account-settings/+server.ts) |
| `POST …/account/change_margin_mode` | ISOLATION/CROSS; only with no open position or order on the symbol | ✅ | [routes/api/account-settings](../../src/routes/api/account-settings/+server.ts) |
| `POST …/account/change_position_mode` | ONE_WAY/HEDGE; only with no open positions or orders | ✅ | [routes/api/account-settings](../../src/routes/api/account-settings/+server.ts) |
| `POST …/account/adjust_position_margin` | Increase or reduce margin; isolated only | ✅ | [routes/api/account-settings](../../src/routes/api/account-settings/+server.ts) |

Leverage, margin mode and position mode are adjustable in the trade panel
([ExchangeAccountControls](../../src/components/inputs/ExchangeAccountControls.svelte)),
and a position's isolated margin via
[AdjustMarginModal](../../src/components/shared/AdjustMarginModal.svelte)
(FEAT-0068). The documented preconditions (margin mode only with no position
or order on the symbol, position mode only with no open positions or orders)
disable the respective button with a reason; they are still enforced by the
exchange.

### Market (`04_market.md`) — public, no API key needed

| Endpoint | Status | Code / Note |
|---|---|---|
| `GET …/market/tickers` | ✅ | [routes/api/tickers](../../src/routes/api/tickers/+server.ts) |
| `GET …/market/kline` | ✅ | [routes/api/klines](../../src/routes/api/klines/+server.ts) |
| `GET …/market/funding_rate/batch` | ✅ | [routes/api/funding-rate](../../src/routes/api/funding-rate/+server.ts); percent→fraction normalisation in `apiService.fetchBitunixFundingRates` |
| `GET …/market/funding_rate` (single) | ❌ | Covered by the batch endpoint — deliberately not needed |
| `GET …/market/get_funding_rate_history` | ❌ | — |
| `GET …/market/depth` (REST) | ❌ | WS `depth_book5` is used instead |
| `GET …/market/trading_pairs` | 🟡 | `fetchTradingPairInfo` exists and is live-read by `tradeService.placeOrder` (`basePrecision`, `minTradeVolume`, …); adapter declares `tradingPairInfo: true` — verify caller coverage, then flip to ✅ |

### Position (`05_position.md`)

| Endpoint | Status | Code / Note |
|---|---|---|
| `GET …/position/get_pending_positions` | ✅ | [routes/api/positions](../../src/routes/api/positions/+server.ts), [routes/api/sync/positions-pending](../../src/routes/api/sync/positions-pending/+server.ts) |
| `GET …/position/get_history_positions` | ✅ | [routes/api/sync/positions-history](../../src/routes/api/sync/positions-history/+server.ts) |
| `GET …/position/get_position_tiers` | ❌ | Maintenance margin tiers → enables a more precise liquidation price and risk calculation |

### Trade (`07_trade.md`)

| Endpoint | Status | Code / Note |
|---|---|---|
| `POST …/trade/place_order` | ✅ | [routes/api/orders](../../src/routes/api/orders/+server.ts) (`type: "place-order"`), client: `tradeService.placeOrder()`. Sent: `symbol`, `side`, `orderType`, `qty`, `price`, `reduceOnly`, `tradeSide`/`positionId` (hedge), `triggerPrice`, plus since FEAT-0069 `tpPrice`/`tpStopType`/`tpOrderType`/`tpOrderPrice`, the `sl*` counterparts, `effect` (limit only) and `clientId` (one ID per send attempt, reusable on retry) |
| `POST …/trade/cancel_orders` | ✅ | `cancelBitunixOrder` in [routes/api/orders](../../src/routes/api/orders/+server.ts). Known adapter limitation: cancel by `orderId` only — cancel by `clientId` alone is not wired (`tradeService.cancelOrder` returns early without `orderId`). |
| `POST …/trade/cancel_all_orders` | ✅ | Native `cancel-all-orders` via `routes/api/orders` (`type: "cancel-all"`); client loop removed |
| `POST …/trade/close_all_position` | ✅ | Native `close-all-positions` for Bitunix (`tradeService.closeAllPositions`, venue `venues/bitunix.ts`) |
| `POST …/trade/flash_close_position` | ✅ | Native `flash-close-position` when a positionId exists (`tradeService.flashClosePosition`, venue `venues/bitunix.ts`); falls back to MARKET reduceOnly otherwise |
| `POST …/trade/modify_order` | ✅ | Native Safe Modify (`tradeService.modifyOrder` backfills missing qty/price from live `get_order_detail`, venue `venues/bitunix.ts`) |
| `POST …/trade/batch_order` | ❌ | Max 5 orders per request, including TP/SL per order — interesting for scale-in and ladder strategies |
| `GET …/trade/get_pending_orders` | ✅ | [routes/api/orders](../../src/routes/api/orders/+server.ts) |
| `GET …/trade/get_history_orders` | ✅ | [routes/api/orders](../../src/routes/api/orders/+server.ts), [routes/api/sync/orders](../../src/routes/api/sync/orders/+server.ts) |
| `GET …/trade/get_history_trades` | ✅ | [routes/api/sync](../../src/routes/api/sync/+server.ts) (journal) |
| `GET …/trade/get_order_detail` | ✅ | [routes/api/sync/order-detail](../../src/routes/api/sync/order-detail/+server.ts) |

### TP/SL (`06_tp_sl.md`)

| Endpoint | Status | Code / Note |
|---|---|---|
| `GET …/tpsl/get_pending_orders` | ✅ | [routes/api/tpsl](../../src/routes/api/tpsl/+server.ts) (`action: "pending"`) |
| `GET …/tpsl/get_history_orders` | ✅ | [routes/api/tpsl](../../src/routes/api/tpsl/+server.ts) (`action: "history"`) |
| `POST …/tpsl/cancel_order` | ✅ | [routes/api/tpsl](../../src/routes/api/tpsl/+server.ts) (`action: "cancel"`) |
| `POST …/tpsl/modify_order` | ✅ | [routes/api/tpsl](../../src/routes/api/tpsl/+server.ts) (`action: "modify"`); UI: [TpSlEditModal](../../src/components/shared/TpSlEditModal.svelte). Wire format fixed in BUG-0293 — it previously sent `{symbol, planType, triggerPrice}`, a shape this endpoint does not document. |
| `POST …/tpsl/place_order` | ✅ | FEAT-0070: [routes/api/tpsl](../../src/routes/api/tpsl/+server.ts) (`action: "place"`); UI: [TpSlCreateModal](../../src/components/shared/TpSlCreateModal.svelte) (partial section) |
| `POST …/tpsl/position/place_order` | ✅ | FEAT-0070: [routes/api/tpsl](../../src/routes/api/tpsl/+server.ts) (`action: "place-position"`); UI: [TpSlCreateModal](../../src/components/shared/TpSlCreateModal.svelte) (position-wide section) |
| `POST …/tpsl/position/modify_order` | ❌ | Adding a missing leg to an existing position-wide plan; not wired. `TpSlCreateModal` routes an already-covered leg to the single-leg `TpSlEditModal` instead, which uses `tpsl/modify_order`. |

### Miscellaneous

- **Plan orders (trigger orders): 🟡 called, but undocumented by the venue.**
  Cachy reads `GET /api/v1/futures/plan/get_history_plan_orders` in the journal
  sync
  ([routes/api/sync/orders](../../src/routes/api/sync/orders/+server.ts), one of
  three parallel sources). **The endpoint appears nowhere in Bitunix's
  documentation.** Verified 2026-09-28: there is no `plan` section in the
  Futures sidebar, and `…/api-docs/futures/plan/get_history_plan_orders.html`
  returns **404**. The place/cancel/get_pending members of the family are
  equally absent. So this is not a crawl that was missed — there is nothing on
  the vendor side to crawl.

  Two consequences worth knowing:

  - **The wire format in this repository is unverified against any
    documentation.** Whatever shape `fetchBitunixPage` expects for these orders
    is inherited from the code, not from a spec. It is one of only a handful of
    call sites in Cachy with no upstream source to check against.
  - **A failure here is silent by design.** The route uses `Promise.allSettled`
    and the comment says so: *"A source that fails degrades to nothing rather
    than failing the page."* If this endpoint stops working, the journal
    imports regular and TP/SL orders and silently omits trigger orders, leaving
    one `logger.warn` and no user-visible signal. The page cursor is derived
    from the orders that *did* arrive, so the walk still terminates — the
    degradation is bounded, not a hang.

  Bitunix's prehash does not include the request path
  (`nonce + timestamp + apiKey + queryParams + body`), so one signature covers
  all three sources. The upside is three calls for one envelope; the downside
  is that the signature cannot detect a wrong path — a typo here surfaces only as
  a venue-side error, swallowed by the `allSettled` above.

  Whether the endpoint still works cannot be established from outside: Bitunix
  answers an invalid credential with **HTTP 200 and `code: 404`**, so an
  unauthenticated probe returns the same body as a missing route. This needs a
  credentialed check.
- **CopyTrading** (`03_copytrading.md`): asset query + sub-account transfers —
  not integrated, currently out of scope.

---

## 2. WebSocket channels (`08_websocket.md`)

| Channel | Type | Status | Note |
|---|---|---|---|
| `price` (MarketPrice: mark/index, funding) | public | ✅ | |
| `ticker` (24h, single) | public | ✅ | |
| `tickers` (batch, incl. best bid/ask `bd`/`ak`/`bv`/`av`) | public | ❌ | Best bid/ask would be useful for the trade panel (spread display, market order estimate) |
| `depth_book5` | public | ✅ | `books`/`book1`/`book15` unused |
| `market_kline_*` | public | ✅ | Natively subscribed for `1min, 5min, 15min, 30min, 60min, 4h, 1day, 1week, 1month`; the rest synthesised via `BROKER_CAPABILITIES`. `mark_*` never subscribed. |
| `trade` (public trades) | public | ✅ | |
| `order` | private | ✅ | |
| `position` | private | ✅ | |
| `wallet` (balance) | private | ✅ | Fields `expMoney`, `isolationFrozen`, `crossFrozen` are received but not displayed |
| `tp_sl` (TP/SL channel) | private | ✅ | Each leg (TP/SL) arrives as its own push, not atomically together — `tpSlState.updateFromWs()` updates per leg |

Important documentation note (from `07_trade.md`/`06_tp_sl.md`): a successful
REST response on an order-changing endpoint does **not** guarantee the operation
went through — the WS push message is the reliable confirmation. New write
endpoints should therefore follow the same OMS / WS confirmation pattern as the
existing ones.

---

## 3. Account data: available vs. displayed

Already fetched and displayed
([AccountSummary](../../src/components/shared/AccountSummary.svelte) +
`AccountTooltip`): `available`, `margin`, PnL, `frozen`, `transfer`, `bonus`,
`positionMode`, `crossUnrealizedPNL`, `isolationUnrealizedPNL`,
`totalPositionSize` (computed client-side).

Fetched but not surfaced:

- **Leverage + margin mode per symbol** (`get_leverage_margin_mode`) — read and
  write (FEAT-0068)
- Position tiers (maintenance margin tiers)
- Trading pair limits (precision, min/max order sizes, max leverage)
- `expMoney`, `isolationFrozen`, `crossFrozen` from the wallet channel

---

## 4. Prioritised gaps (recommendation)

1. **`trading_pairs`** — order validation and precision; the basis for
   everything else
2. ~~**Account settings block**~~ — done (FEAT-0068):
   `get_leverage_margin_mode` (read) + `change_leverage`,
   `change_margin_mode`, `change_position_mode`, `adjust_position_margin`
   (write). Bitget remains open — the request format is documented as of
   FEAT-0525, but the endpoints sit on the decommissioned V1 API, so the
   migration in BUG-0576 has to land before they can be wired.
3. ~~**Complete `place_order`**~~ — done (FEAT-0069): `tpPrice`/`slPrice`
   atomic, `effect`, `clientId`
4. ~~**`tpsl/place_order` + `tpsl/position/place_order`**~~ — done (FEAT-0070):
   set TP/SL after the fact, position-wide and partial
5. **Native endpoints instead of client loops** — `cancel_all_orders`,
   `close_all_position`, `flash_close_position`, `modify_order`
6. ~~**Subscribe to the private TP/SL WS channel**~~ — done: `tp_sl` channel
   subscribed, `tpSlState.updateFromWs()` processes pushes live instead of only
   via the 30s REST cache
7. Nice-to-have: `tickers` batch channel (best bid/ask), funding history,
   position tiers
