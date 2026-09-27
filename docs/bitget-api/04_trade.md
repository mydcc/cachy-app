# Bitget Classic Futures — Trade

Source: https://www.bitget.com/legacy-docs/classic/contract/trade/Place-Order
Crawled on: 2026-09-28

The 13 order-lifecycle endpoints of the Classic Futures **Trade** group. Every one
is private: signed with the `ACCESS-KEY` / `ACCESS-SIGN` / `ACCESS-TIMESTAMP` /
`ACCESS-PASSPHRASE` headers described in `01_sign.md`, and every rate limit on
this page is counted **per UID**, not per IP.

Bitget reports success as `code: "00000"` inside an **HTTP 200**. A non-zero
`code` also arrives as HTTP 200, so the body is the only place a business
failure is visible.

`POST /api/v2/mix/order/place-order` additionally accepts **attached TP/SL** in
four optional fields — see [Native attached TP/SL](#native-attached-tpsl-on-place-order)
below. This is the cheapest native TP/SL path in the whole API: one request
places the order and its take-profit and stop-loss together, with no plan-order
bookkeeping at all. The full plan-order family lives in `06_tp_sl.md`.

> Cachy wires a subset; see `INTEGRATION_STATUS.md`.

## Overview

| # | Endpoint | Method | Auth | Rate limit (as printed) |
|---|---|---|---|---|
| 1 | Place Order | `POST` | private (signed) | `Rate limit: 10 requests/second/UID` |
| 2 | Reversal | `POST` | private (signed) | `Rate limit: 10 req/sec/UID` + `Rate limit: 1 req/sec/UID for **copy trading traders**` |
| 3 | Batch Order | `POST` | private (signed) | `Rate limit: 5 requests/second/UID` + `Rate limit: 1 request/second/UID for **copy trading traders**` |
| 4 | Modify Order | `POST` | private (signed) | `Speed limit is 10 times/s for average users. Frequency limit imposed according to user ID` |
| 5 | Cancel Order | `POST` | private (signed) | `Frequency limit: 10 times/1s` |
| 6 | Batch Cancel | `POST` | private (signed) | `Speed limit is 10 times/s for average users. Frequency limit imposed according to user ID` |
| 7 | Flash Close Position | `POST` | private (signed) | `Frequency limit: 1 time/1s (User ID)` |
| 8 | Get Order Detail | `GET` | private (signed) | `Frequency limit: 10 times/1s (uid)` |
| 9 | Get Order Fill Details | `GET` | private (signed) | `Speed limit is 10 times/s for average users. Frequency limit imposed according to user ID` |
| 10 | Get Historical Transaction Details | `GET` | private (signed) | `Frequency limit: 10 times/1s (uid)` |
| 11 | Get Pending Orders | `GET` | private (signed) | `Rate limit: 10 req/sec/UID` |
| 12 | Get History Order | `GET` | private (signed) | `Rate limit: 10 req/sec/UID` |
| 13 | Cancel All Orders | `POST` | private (signed) | `Rate limit: 10 req/sec/UID` |

Six different renderings of the same 10/s budget appear across these 13 pages —
`Rate limit: 10 requests/second/UID`, `Rate limit: 10 req/sec/UID`, `Frequency
limit: 10 times/1s`, `Frequency limit: 10 times/1s (uid)`, and the prose
`Speed limit is 10 times/s for average users. Frequency limit imposed according
to user ID` — and `Cancel Order` drops the scope word entirely
(`Frequency limit: 10 times/1s`, no `(uid)`). All are quoted verbatim above and
per-endpoint below; **no limit on this page has been normalised.** Where the
source omits the scope, this document does not invent one.

## `side` / `tradeSide` in hedge mode

This is the single most important thing on the page. In **hedge mode** `side` is
the *position direction*, not the transaction direction, and `tradeSide` says
whether the order opens or closes. Verbatim from the Place Order page:

> **hedge position mode**: **Open long**: "side"=`buy`, "tradeSide"=`open`;
> **Close long**: "side"=`buy`, "tradeSide"=`close`; **Open short**: "side"=`sell`,
> "tradeSide"=`open`; **Close short**: "side"=`sell`, "tradeSide"=`close`;
> **one-way position mode**: "side"=`buy` and `sell`, tradeSide: ignore

| Intent | `side` | `tradeSide` |
|---|---|---|
| Open long | `buy` | `open` |
| Close long | `buy` | `close` |
| Open short | `sell` | `open` |
| Close short | `sell` | `close` |

A long position is closed with `side=buy`, not `sell`. In **one-way mode** only
`side` is used and `tradeSide` is ignored entirely — Place Order and Batch Order
both say so verbatim ("Ignore the `tradeSide` parameter when position mode is in
`one-way-mode`"). `tradeSide` is documented as required in hedge mode on Place
Order, Batch Order and Reversal.

## Native attached TP/SL on Place Order

`POST /api/v2/mix/order/place-order` takes four optional TP/SL fields, so one
call places an order and its protection together:

| Field | Type | Required | Description (verbatim) |
|---|---|---|---|
| `presetStopSurplusPrice` | String | No | Take-profit value. No take-profit is set if the field is empty. |
| `presetStopLossPrice` | String | No | Stop-loss value. No stop-loss is set if the field is empty. |
| `presetStopSurplusExecutePrice` | String | No | Preset stop - profit execution price. |
| `presetStopLossExecutePrice` | String | No | Preset stop-loss execution price. |

Empty string means "no take-profit / no stop-loss is set" — an omitted field is
not the same as a `0`. On `GET /api/v2/mix/order/detail` the trigger type comes
back separately as `presetStopSurplusType` / `presetStopLossType`
(`fill_price` | `mark_price`), and `0` or an absent
`presetStopSurplusExecutePrice` means market-price execution, a value `> 0`
means limit-price execution.

`POST /api/v2/mix/order/batch-place-order` supports `presetStopSurplusPrice` and
`presetStopLossPrice` per order-list entry, but **not** the two
`*ExecutePrice` fields. Its page states: "Supports TP/SL feature. If the current
underlying asset does not exist in the position, it is intended to preset the
TP/SL. If the current underlying exists in the position, it is intended to
modify the TP/SL."

`POST /api/v2/mix/order/modify-order` is the corresponding amend path, with
`newPresetStopSurplusPrice` and `newPresetStopLossPrice`. Per the page: filling
`0` deletes an existing TP/SL; leaving a field empty keeps the original.

## Place Order

- Rate limit: `Rate limit: 10 requests/second/UID`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/place-order`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair, e.g. `ETHUSDT` |
| `productType` | String | Yes | `USDT-FUTURES` USDT-M Futures / `COIN-FUTURES` Coin-M Futures / `USDC-FUTURES` USDC-M Futures |
| `marginMode` | String | Yes | `isolated`: isolated margin / `crossed`: crossed margin |
| `marginCoin` | String | Yes | Margin coin (capitalized) |
| `size` | String | Yes | Amount (base coin). Decimals per Get Contract Config |
| `price` | String | No | Price of the order. Required if the `orderType` is `limit` |
| `side` | String | Yes | `buy`: Buy (**one-way-mode**); Long position direction (**hedge-mode**) / `sell`: Sell (**one-way-mode**); Short position direction (**hedge-mode**) |
| `tradeSide` | String | No | **Only required in hedge-mode.** `open`: Open position / `close`: Close position |
| `orderType` | String | Yes | `limit`: limit orders / `market`: market orders |
| `force` | String | No | Required if the `orderType` is `limit`. `ioc`: Immediate or cancel / `fok`: Fill or kill / `gtc`: Good till canceled (**default value**) / `post_only`: Post only |
| `clientOid` | String | No | Customize order ID |
| `reduceOnly` | String | No | Whether or not to just reduce the position: `YES`, `NO`. Default `NO`. Applicable only in **one-way-position** mode |
| `presetStopSurplusPrice` | String | No | Take-profit value. No take-profit is set if the field is empty |
| `presetStopLossPrice` | String | No | Stop-loss value. No stop-loss is set if the field is empty |
| `presetStopSurplusExecutePrice` | String | No | Preset stop - profit execution price |
| `presetStopLossExecutePrice` | String | No | Preset stop-loss execution price |
| `stpMode` | String | No | STP Mode (Self Trade Prevention). `none`: not setting STP (default value) / `cancel_taker`: cancel taker order / `cancel_maker`: cancel maker order / `cancel_both`: cancel both of taker and maker orders |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `orderId` | String | Order ID |
| `clientOid` | String | Customize order ID |

### Description notes (verbatim)

- "In `one-way-mode` position mode, if the total size of the new reduce-only
  order and the existing reduce-only orders exceeds the position size, the
  system will cancel the existing reduce-only orders sequentially based on their
  creation order until the total size of the new and existing reduce-only orders
  is less than or equal to the position size. Additionally, the response for the
  latest reduce-only order request will not include an `orderId`. You can use the
  `clientOid` set in the request to query order details or retrieve the orderId
  from the current pending orders."
- "When in `hedge Mode`, if a limit close order is occupying a position, and a
  subsequent market close order (its quantity plus the limit order's quantity)
  exceeds the total position size, it will not report an insufficient position
  error. It also won't cancel the limit order that's occupying the position.
  Instead, the quantity of the limit close order will be preserved, and the
  market order will close only the quantity remaining after subtracting the
  limit order's quantity from the total position size."
- "**API Broker rebate identifier**: The following code block needs to be added
  to the HTTP Header of the request." → `"X-CHANNEL-API-CODE":"your-channel-api-code"`

> #### ⚠️ The hedge-mode paragraph above contradicts the changelog
>
> The quoted text says an over-sized market close against an occupying limit
> close does **not** error, does **not** cancel the limit order, and partially
> closes. The changelog entry **2025-07-31, *Optimization of the futures order
> placement interface logic*** states that before that date it *did* error, and
> that after it the market close **automatically cancels** the limit order:
>
> > **after:** In hedge mode, if the existing quantity is equal to the limit
> > close order of the position, a newly added market close order will
> > **automatically cancel the limit order** that has occupied the position
> > (consistent with Web/APP).
>
> So the page describes a third behaviour that matches neither the "before" nor
> the "after", and the endpoint documentation was never updated. The changelog
> is the newer and more authoritative source: **the current behaviour is that
> the market close cancels the occupying limit order.**
>
> This is not cosmetic. A close that used to fail now **cancels a resting limit
> order as a side effect**, so any UI copy promising that a close leaves other
> orders untouched is wrong for Bitget. Full discussion in
> `08_error_codes.md`.

## Reversal

- Rate limit: `Rate limit: 10 req/sec/UID` and `Rate limit: 1 req/sec/UID for **copy trading traders**`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/click-backhand`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair, e.g. `ETHUSDT` |
| `marginCoin` | String | Yes | Margin coin e.g: USDT |
| `productType` | String | Yes | `USDT-FUTURES` / `COIN-FUTURES` / `USDC-FUTURES` |
| `size` | String | No | Amount. In `one-way-mode` the whole position is reversed if unset; in `hedge-mode` it is the reversal size |
| `side` | String | Yes | Order direction. `buy`: Buy / `sell`: Sell |
| `tradeSide` | String | No | Required in open and close (hedge mode) position. For one-way positions this field will be ignored |
| `clientOid` | String | No | Customize order ID |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `orderId` | String | Order ID |
| `clientOid` | String | Customize order ID |

### Description notes (verbatim)

- "`side` and `tradeSide`： In `one-way-mode`, do NOT add the `tradeSide`
  parameter in request. In `hedge-mode`, `tradeSide` is required"
- "`size`: represents the reversal size. In `one-way-mode`, the whole position
  will be reversed if no `size` was set in the request. In `hedge-mode`: If the
  `size` set is less than the current position size, the `size` of position will
  be closed and the same size reversal position will be opened… If the `size` set
  is equal to or more than the current position size, the whole position will be
  reversed"
- **Doc defect:** the `tradeSide` description on this page renders its value
  list incompletely — "Reversal the current long position and open a short
  position: `side`=buy, `tradeSide`" and "Reversal the current short position
  and open a long position: `side`=sell, `tradeSide`" both **omit the
  `tradeSide` value**. The `tradeSide` request-parameter table on the same page
  does list it ("For open long, fill in "Buy"; tradeSide should be "Open"…").
  Read the parameter table, not the description bullets.
- "**API Broker rebate identifier**" — same `X-CHANNEL-API-CODE` header note.

## Batch Order

- Rate limit: `Rate limit: 5 requests/second/UID` and `Rate limit: 1 request/second/UID for **copy trading traders**`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/batch-place-order`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | `USDT-FUTURES` / `COIN-FUTURES` / `USDC-FUTURES` |
| `marginCoin` | String | Yes | Margin coin, must be capitalized |
| `marginMode` | String | Yes | `isolated`: isolated margin / `crossed`: crossed margin |
| `orderList` | List\<Object\> | Yes | Order list, **maximum length: 50** |
| `>size` | String | Yes | Amount |
| `>price` | String | No | Price of the order. Required if the order type is `limit` |
| `>side` | String | Yes | Order direction. `buy`: Buy / `sell`: Sell |
| `>tradeSide` | String | No | **Only required in hedge-mode.** `open` / `close` |
| `>orderType` | String | Yes | `limit`: limit orders / `market`: market orders |
| `>force` | String | No | Required if the `orderType` is `limit`, default value is `gtc`. `ioc` / `fok` / `gtc` / `post_only` |
| `>clientOid` | String | No | Custom order ID |
| `>reduceOnly` | String | No | Whether or not to just reduce the position: `YES`, `NO`. Default `NO`. Applicable only in **one-way-position** mode |
| `>presetStopSurplusPrice` | String | No | Take-profit value. No take-profit is set if the field is empty |
| `>presetStopLossPrice` | String | No | Stop-loss value. No stop-loss is set if the field is empty |
| `>stpMode` | String | No | STP Mode, default `none`. `none` / `cancel_taker` / `cancel_maker` / `cancel_both` |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `successList` | List\<Object\> | Successful order list |
| `>orderId` | String | Order ID |
| `>clientOid` | String | Customize order ID |
| `failureList` | List\<Object\> | Failed order list |
| `>orderId` | String | Order ID |
| `>clientOid` | String | Customize order ID |
| `>errorMsg` | String | Failure reason |
| `>errorCode` | String | Failure code |
| `result` | Boolean | Whether all orders succeeded. `true`: all succeeded; `false`: at least one failed |

### Description notes (verbatim)

- "Supports TP/SL feature. If the current underlying asset does not exist in
  the position, it is intended to preset the TP/SL. If the current underlying
  exists in the position, it is intended to modify the TP/SL"
- "Ignore the `tradeSide` parameter when position mode is in `one-way-mode`"
- **Doc defect:** the `>tradeSide` description writes the value as `Open` /
  `open` inconsistently for the same case — "For open long, `side` fill in
  "buy"; `tradeSide` should be "Open"… For open short, `side` fill in "sell";
  `tradeSide` should be "open"". Place Order's equivalent bullet uses lowercase
  `open` for both. The wire value is lowercase `open` / `close`.
- **Doc defect:** the `>tradeSide` value list is the same for Place Order and
  Reversal but is inconsistently capitalised on this page; treat
  [the table above](#side--tradeside-in-hedge-mode) as authoritative.

## Modify Order

- Rate limit: `Speed limit is 10 times/s for average users. Frequency limit imposed according to user ID`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/modify-order`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | String | No | Order ID. Either `orderId` or `clientOid` is required. If both are entered, `orderId` prevails |
| `clientOid` | String | No | Customize order ID. Either `orderId` or `clientOid` is required. If both are entered, `orderId` prevails |
| `symbol` | String | Yes | Trading pair, e.g. `ETHUSDT` |
| `productType` | String | Yes | `USDT-FUTURES` / `COIN-FUTURES` / `USDC-FUTURES` |
| `newClientOid` | String | **Yes** | New customized order ID after order modification |
| `newSize` | String | No | Amount of the modified transaction. The amount stays unchanged if the field is left blank |
| `newPrice` | String | No | Modified price for placing new orders. When the existing order type is Limit, the original price will be maintained if empty. When the existing order type is Limit market, the field should not be set |
| `newPresetStopSurplusPrice` | String | No | Modifying take-profit. Empty keeps the original; a value updates or adds; `0` deletes an existing TP |
| `newPresetStopLossPrice` | String | No | Modifying stop-loss. Empty keeps the original; a value updates or adds; `0` deletes an existing SL |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `orderId` | String | Order ID |
| `clientOid` | String | Customize order ID |

### Description notes (verbatim)

- "Modifying size and price will cancel the old order; then create a **new
  order** asynchronously, modify the preset TPSL will not cancel the old order."
- "Modifying size and price, please pass in both, not just one of them"
- "It is only allowed to modify the new status limit order. If the size, price
  and TPSL all is set in the request, then the TPSL will not work"
- "Modify the limit order price and size, please be sure to provide
  newClientOid, because the orderId of the new order cannot be returned
  synchronously, so you need to use newClientOid to help you query order
  information"
- "Modifying the order size needs to meet the minimum order quantity"
- "If you only modify the TPSL, please do not pass price and size. If you only
  pass one of TP or SL, the other one will be cancelled"

## Cancel Order

- Rate limit: `Frequency limit: 10 times/1s`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/cancel-order`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | `USDT-FUTURES` / `COIN-FUTURES` / `USDC-FUTURES` |
| `marginCoin` | String | No | Margin coin must be capitalized |
| `orderId` | String | No | Order ID. Either `orderId` or `clientOid` is required. If both are present, `orderId` prevails |
| `clientOid` | String | No | Customize order ID. Either `orderId` or `clientOid` is required. If both are present, `orderId` prevails |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `orderId` | String | Order ID |
| `clientOid` | String | Client customized ID |

> **Note:** this is the only Trade page whose rate limit is printed **without a
> scope word** — no `(uid)`, no `/UID`. See the Overview caveat.

## Batch Cancel

- Rate limit: `Speed limit is 10 times/s for average users. Frequency limit imposed according to user ID`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/batch-cancel-orders`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderIdList` | List | No | Order ID list, **maximum length: 50**. If filled in, `symbol` must not be null and must be aligned with symbol/productType |
| `>orderId` | String | No | Order ID. Either `orderId` or `clientOid` is required. If both are entered, `orderId` prevails |
| `>clientOid` | String | No | Customize order ID. Either `orderId` or `clientOid` is required. If both are entered, `orderId` prevails |
| `symbol` | String | No | Trading pair, e.g. `ETHUSDT`. **It's required when `orderIdList` is set** |
| `productType` | String | Yes | `USDT-FUTURES` / `COIN-FUTURES` / `USDC-FUTURES` |
| `marginCoin` | String | No | Margin coin must be capitalized |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `successList` | List\<Object\> | The collection of successfully cancelled orders |
| `>orderId` | String | Order ID |
| `>clientOid` | String | Customize order ID |
| `failureList` | List\<Object\> | The collection of unsuccessfully cancelled orders |
| `>orderId` | String | Order ID |
| `>clientOid` | String | Customize order ID |
| `>errorMsg` | String | Failure reason |
| `>errorCode` | String | Error code |

## Flash Close Position

**This is the tightest rate limit in the entire Classic Futures surface — 1
request/second, per UID.** Every other Trade endpoint budgets 10/s. It is the
only endpoint that closes a position at market without naming an individual
order, and the one the whole bulk-close question turns on: it is the only
single call that flattens a position, and it will accept a **blank `holdSide`**
to close *every* position in hedge mode for that symbol and product type.

- Rate limit: `Frequency limit: 1 time/1s (User ID)`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/close-positions`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | **No** | Trading pair |
| `holdSide` | String | Optional | Position direction. 1. In one-way position mode (buy or sell): This field should be left blank. Will be ignored if filled in. 2. In hedge-mode position (open or close): **All positions will be closed if the field is left blank**; Positions of the specified direction will be closed if the field is filled in. `long`: Long position; `short`: Short position |
| `productType` | String | Yes | `USDT-FUTURES` USDT-M Futures / `COIN-FUTURES` Coin-M Futures / `USDC-FUTURES` USDC-M Futures |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `successList` | List\<Object\> | The collection of successfully closed orders |
| `>orderId` | String | Order ID |
| `>clientOid` | String | Customize order ID |
| `>symbol` | String | The Symbol |
| `failureList` | List\<Object\> | The collection of unsuccessfully closed orders. The close order may fail when the pair is in delivery or in risk control handling |
| `>orderId` | String | Order ID |
| `>clientOid` | String | Customize order ID |
| `>symbol` | String | The Symbol |
| `>errorMsg` | String | Failure reason |
| `>errorCode` | String | Failure code |

### Description notes (verbatim)

- "close position at market price"
- "**API Broker rebate identifier**: The following code block needs to be added
  to the HTTP Header of the request." → `"X-CHANNEL-API-CODE":"your-channel-api-code"`
- **Doc defect:** `symbol` is marked **Required: No** in the parameter table,
  yet every documented example sends it and there is no other way to scope a
  close to one pair. Treat `symbol` as required in practice; the "No" is a
  documentation error.
- **Doc defect:** the `holdSide` bullet reads "Positions of the specified
  direction will be closed **is** the field is filled in" — a typo for "if".
  Verbatim as printed.

## Get Order Detail

**The path is `GET /api/v2/mix/order/detail` — not `/orderInfo`.** The
`orderInfo` form belongs to the dead V1 API.

- Rate limit: `Frequency limit: 10 times/1s (uid)`
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/order/detail`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Product ID must be capitalized |
| `productType` | String | Yes | `USDT-FUTURES` / `COIN-FUTURES` / `USDC-FUTURES` |
| `orderId` | String | No | Order ID. Either `orderId` or `clientOid` is required |
| `clientOid` | String | No | Custom order ID. Either `orderId` or `clientOid` is required |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `symbol` | String | Trading pair |
| `size` | String | Amount |
| `orderId` | String | Order ID |
| `clientOid` | String | Customize order ID |
| `baseVolume` | String | Amount of coins traded |
| `priceAvg` | String | Average price |
| `fee` | String | Transaction fee |
| `price` | String | Order price |
| `state` | String | Order status. `live`: New order, waiting for a match in orderbook / `partially_filled`: Partially filled / `filled`: All filled / `canceled`: the order is cancelled |
| `side` | String | Direction. `buy` / `sell` |
| `force` | String | Order expiration date. `ioc` / `fok` / `gtc` / `post only` |
| `totalProfits` | String | Total PnL |
| `posSide` | String | Position direction. `long`: hedge mode long position / `short`: hedge mode short position / `net`: one-way position |
| `marginCoin` | String | Margin coin |
| `presetStopSurplusPrice` | String | Set TP |
| `presetStopSurplusType` | String | Preset Take Profit Trigger type. `fill_price`: market price; `mark_price`: mark price |
| `presetStopSurplusExecutePrice` | String | Preset Take Profit Execution price |
| `presetStopLossPrice` | String | Set SL |
| `presetStopLossType` | String | Preset Stop Loss Trigger type. `fill_price`: market price; `mark_price`: mark price |
| `presetStopLossExecutePrice` | String | Preset Stop Loss Execution price |
| `quoteVolume` | String | Trading amount in quoting coin |
| `orderType` | String | Order type. `limit` / `market` |
| `leverage` | String | Leverage |
| `marginMode` | String | Margin mode. `isolated`: isolated margin / `crossed`: cross margin |
| `reduceOnly` | String | Whether or not to just reduce the position. `YES` / `NO` |
| `enterPointSource` | String | Order source. `WEB` / `API` / `SYS` (usually generated by forced liquidation logic) / `ANDROID` / `IOS` |
| `tradeSide` | String | Direction — a long enumeration of system action types, see below |
| `newTradeSide` | String | Trade direction (new). Returned together with `tradeSide` for upgraded accounts; may be `null` for legacy orders |
| `posMode` | String | Position mode. `one_way_mode`: one-way position / `hedge_mode`: two-way position |
| `orderSource` | String | Order source — a long enumeration, see below |
| `cancelReason` | String | Cancel reason. `normal_cancel`: Normal cancel / `stp_cancel`: Cancelled by STP |
| `cTime` | String | Creation time, ms |
| `uTime` | String | Update time, ms |

### `tradeSide` values (verbatim)

`close`, `open`, `reduce_close_long`, `reduce_close_short`（full-width semicolon）,
`burst_close_long`, `burst_close_short`, `offset_close_long`, `offset_close_short`,
`delivery_close_long`, `delivery_close_short`, `dte_sys_adl_close_long`,
`dte_sys_adl_close_short`, `buy_single`, `sell_single`, `reduce_buy_single`,
`reduce_sell_single`, `burst_buy_single`, `burst_sell_single`,
`delivery_sell_single`, `delivery_buy_single`,
`dte_sys_adl_buy_in_single_side_mode`, `dte_sys_adl_sell_in_single_side_mode`.

> Note the trade-off with the request-side meaning: on **placement** `tradeSide`
> is only `open` / `close`; on **read-back** it is a wide system-action
> enumeration where `buy_single` / `sell_single` cover one-way mode. Do not
> round-trip the response value back into a request.

### `orderSource` values (verbatim)

`normal`, `market`, `profit_market`, `loss_market`, `Trader_delegate`,
`trader_profit`, `trader_loss`, `reverse`, `trader_reverse`, `profit_limit`,
`loss_limit`, `liquidation`, `delivery_close_long`, `delivery_close_short`,
`pos_profit_limit`, `pos_profit_market`, `pos_loss_limit`, `pos_loss_market`,
`profit_chase`, `loss_chase`, `follower_delegate`, `reduce_offset`,
`market_risk`, `plan_limit`, `plan_market`, `pos_loss_limit`,
`strategy_positive`, `strategy_reverse`, `strategy_unlimited`, `move_limit`,
`move_market`, `tracking_limit`, `tracking_market`, `strategy_dca_positive`,
`strategy_dca_reverse`, `strategy_oco_limit`, `strategy_oco_trigger`,
`modify_order_limit`, `strategy_regular_buy`, `strategy_grid_middle`.

> **Doc defect:** `pos_loss_limit` appears **twice** in the list on this page (and
> on Get Pending Orders and Get History Order), with two different descriptions —
> "Position stop-loss limit order" and "Position Stop Loss Limit". Verbatim as
> printed.

## Get Order Fill Details

- Rate limit: `Speed limit is 10 times/s for average users. Frequency limit imposed according to user ID`
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/order/fills`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | String | No | Order ID |
| `symbol` | String | No | Trading pair, e.g. `ETHUSDT` |
| `productType` | String | Yes | `USDT-FUTURES` / `COIN-FUTURES` / `USDC-FUTURES` |
| `idLessThan` | String | No | Requests the content on the page before the `tradeId` (older data) |
| `startTime` | String | No | Start time (time stamp in milliseconds). Maximum time span supported is **three months**; the default end time is three months if unset. For Managed Sub-Account, cannot be earlier than the binding time |
| `endTime` | String | No | End time (time stamp in milliseconds). Maximum span **three months**; the default start time is three months ago if unset |
| `limit` | String | No | Number of queries: Default 100, maximum 100 |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `fillList` | List\<Object\> | Transaction details |
| `>tradeId` | String | Transaction id |
| `>symbol` | String | Trading pair |
| `>orderId` | String | Order no. |
| `>price` | String | Order price |
| `>baseVolume` | String | Amount of coins traded |
| `>feeDetail` | List\<Object\> | Transaction fee |
| `>>deduction` | String | Whether or not to deduct (vouchers) |
| `>>feeCoin` | String | Crypto ticker |
| `>>totalDeductionFee` | String | Total transaction fee discount |
| `>>totalFee` | String | Total transaction fee |
| `>side` | String | Type of transaction. `buy`: Buy / `sell`: Sell |
| `>quoteVolume` | String | Trading amount in quote currency |
| `>profit` | String | Profit |
| `>enterPointSource` | String | Order source. `WEB` / `API` / `SYS` / `ANDROID` / `IOS` |
| `>tradeSide` | String | Direction — same wide enumeration as Get Order Detail |
| `>posMode` | String | Position mode. `one_way_mode` / `hedge_mode` |
| `>tradeScope` | String | Trader tag. `taker`: Taker / `maker`: Maker |
| `>cTime` | String | Date of transaction |
| `endId` | String | The final Transaction ID. Used when `idLessThan`/`idGreaterThan` is set as a range |

> **Doc defect:** this page's response table is a markdown rendering artefact —
> the `endId` row is **duplicated**. One copy is spliced into the tail of the
> `>cTime` description cell ("Date of transaction / endId / String / The final
> order ID. This is used when idLessThan/idGreaterThan is set as a range."), and
> a second copy follows the `>cTime` row. The second copy is the accurate one:
> `endId` is the final **Transaction** ID here, not order ID.
>
> **Doc defect:** the descriptions reference `idGreaterThan`, which is **not**
> listed as a request parameter on this page. Only `idLessThan` is documented.

## Get Historical Transaction Details

- Rate limit: `Frequency limit: 10 times/1s (uid)`
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/order/fill-history`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | String | No | Order ID. Either `orderId` or `clientOid` is required. If both are entered, `orderId` prevails |
| `symbol` | String | No | Trading pair, e.g. `ETHUSDT` |
| `productType` | String | Yes | `USDT-FUTURES` / `COIN-FUTURES` / `USDC-FUTURES`. **It does not support to query the data in demo trading** |
| `startTime` | String | No | Start timestamp, Unix **milliseconds**, e.g. 1597026383085. Maximum time span supported is **a week**; the default end time is a week if unset. For Managed Sub-Account, cannot be earlier than the binding time |
| `endTime` | String | No | End timestamp, Unix milliseconds. Maximum span **a week**; the default start time is a week ago if unset |
| `idLessThan` | String | No | Requests the content on the page before this ID (older data); the value should be the `endId` of the corresponding interface |
| `limit` | String | No | Number of queries: Maximum 100, default 100 |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `endId` | String | Last query ended order ID |
| `fillList` | List\<Object\> | Order list |
| `>symbol` | String | Trading pair |
| `>marginCoin` | String | Margin Coin |
| `>tradeId` | String | Transaction ID |
| `>orderId` | String | order id |
| `>price` | String | deal price |
| `>baseVolume` | String | Amount of coins traded |
| `>feeDetail` | List\<Object\> | Transaction fee |
| `>>deduction` | String | Whether or not to deduct (vouchers) |
| `>>feeCoin` | String | Crypto ticker |
| `>>totalDeductionFee` | String | Total transaction fee discount |
| `>>totalFee` | String | Total transaction fee |
| `>side` | String | Direction. Buy; Sell |
| `>quoteVolume` | String | Trading amount in quoting coin |
| `>profit` | String | profit |
| `>enterPointSource` | String | Order source. `WEB` / `API` / `SYS` / `ANDROID` / `IOS` |
| `>tradeSide` | String | Direction — same wide enumeration as Get Order Detail |
| `>posMode` | String | Position mode. `one_way_mode` / `hedge_mode` |
| `>tradeScope` | String | Trader tag. `taker`: Taker / `maker`: Maker |
| `>cTime` | String | Date of transaction |

> **Doc defect:** this page carries the **same duplicated-`endId` rendering
> artefact** as Get Order Fill Details — an `endId` row is spliced into the tail
> of the `>cTime` description cell, and the real `endId` row also appears at the
> top of the table with the description "Last query ended order ID".
>
> Note the span difference between the two fill endpoints: `/order/fills` allows
> **three months**, `/order/fill-history` allows **one week**.

## Get Pending Orders

- Rate limit: `Rate limit: 10 req/sec/UID`
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/order/orders-pending`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | String | No | Order ID. If both `orderId` and `clientOid` are entered, `orderId` prevails |
| `clientOid` | String | No | Customize order ID. If both are entered, `orderId` prevails |
| `symbol` | String | No | Trading pair, e.g. `ETHUSDT` |
| `productType` | String | Yes | `USDT-FUTURES` / `COIN-FUTURES` / `USDC-FUTURES` |
| `status` | String | No | Order status. If not specified, all orders with a status of `live` (not filled yet) will be returned. `live`: pending orders / `partially_filled`: Partially filled |
| `idLessThan` | String | No | Requests the content on the page before this ID (older data); the value should be the `endId` of the corresponding interface |
| `startTime` | String | No | Start timestamp, Unix milliseconds, e.g. 1597026383085. Maximum span **three months**; the default end time is three months if unset |
| `endTime` | String | No | End timestamp, Unix milliseconds. Maximum span **three months**; the default start time is three months ago if unset |
| `limit` | String | No | Number of queries: Maximum 100, default 100 |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `entrustedList` | List\<Object\> | Order list |
| `>symbol` | String | Trading pair |
| `>size` | String | Amount |
| `>orderId` | String | Order ID |
| `>clientOid` | String | Custom id |
| `>baseVolume` | String | Amount of coins traded |
| `>fee` | String | Transaction fee |
| `>price` | String | Order price |
| `>priceAvg` | String | Average order price. Empty when status is `live` |
| `>status` | String | Order status. `live`: Waiting to be filled (not filled yet) / `partially_filled`: Partially filled |
| `>side` | String | Direction. `buy`: Buy; `sell`: Sell |
| `>force` | String | Order expiration date. `ioc` (Immediate or cancel) / `fok` (Fill or kill) / `gtc` (Good till canceled) / `post_only`: Post only |
| `>totalProfits` | String | Total PnL. Empty when status is live |
| `>posSide` | String | Position direction. `long`: two-way long position / `short`: two-way short position / `net`: one-way position |
| `>marginCoin` | String | Margin coin |
| `>quoteVolume` | String | Trading amount in quoting coin |
| `>leverage` | String | Leverage |
| `>marginMode` | String | Margin mode. `isolated`: isolated margin / `crossed`: cross margin |
| `>reduceOnly` | String | Reduce only. `YES`: yes, `NO`: no |
| `>enterPointSource` | String | Order source. `WEB` / `API` / `SYS` / `ANDROID` / `IOS` |
| `>tradeSide` | String | Direction — same wide enumeration as Get Order Detail |
| `>posMode` | String | Position mode. `one_way_mode` / `hedge_mode` |
| `>orderType` | String | Order type. `limit`: limit order / `market`: market order |
| `>orderSource` | String | Order sources — same long enumeration as Get Order Detail, plus `off_close`: Delisting liquidation |
| `>cTime` | String | Creation time, ms |
| `>uTime` | String | Last updated time, ms |
| `>presetStopSurplusPrice` | String | Take Profit Trigger Price |
| `>presetStopSurplusTriggerType` | String | Setting take-profit trigger type. `fill_price`: filled price / `mark_price`: mark price |
| `>presetStopSurplusExecutePrice` | String | Take Profit Execution price. If it is 0 or not filled in, it means market price execution. If it is greater than 0, it means limit price execution |
| `>presetStopLossPrice` | String | Stop Loss Trigger Price |
| `>presetStopLossTriggerType` | String | Setting stop-loss trigger type. `fill_price`: filled price / `mark_price`: mark price |
| `>presetStopLossExecutePrice` | String | Stop Loss Execution price. If it is 0 or not filled in, it means market price execution. If it is greater than 0, it means limit price execution |
| `endId` | String | The final order ID. Used when `idLessThan`/`idGreaterThan` is set as a range |

> **Note:** the TP/SL trigger-type fields are named `presetStopSurplusTriggerType`
> / `presetStopLossTriggerType` here, but `presetStopSurplusType` /
> `presetStopLossType` on Get Order Detail. Different field names for the same
> `fill_price` | `mark_price` value.
>
> **Doc defect:** `>status` is spelled with a leading space in this table
> (`\> status`).

## Get History Order

- Rate limit: `Rate limit: 10 req/sec/UID`
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/order/orders-history`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | String | No | Order ID. If both `orderId` and `clientOid` are entered, `orderId` prevails |
| `clientOid` | String | No | Customize order ID. If both are entered, `orderId` prevails |
| `symbol` | String | No | Trading pair, e.g. `ETHUSDT` |
| `productType` | String | Yes | `USDT-FUTURES` / `COIN-FUTURES` / `USDC-FUTURES` |
| `idLessThan` | String | No | Requests the content on the page before this ID (older data); the value should be the `endId` of the previous request response |
| `orderSource` | String | No | Order sources — see the enumeration under Get Order Detail; this page's request-parameter list is **truncated** to `normal` through `pos_loss_market` |
| `startTime` | String | No | Start timestamp, Unix milliseconds, e.g. 1597026383085. For Managed Sub-Account, cannot be earlier than the binding time |
| `endTime` | String | No | End timestamp, Unix milliseconds, e.g. 1597026383085 |
| `limit` | String | No | Number of queries: Maximum 100, default 100 |

Description: "Get history order (It only supports to get the data within 90days.
The older data can be downloaded from web)"

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `endId` | String | Last query ended order ID |
| `entrustedList` | List\<Object\> | Order list |
| `>symbol` | String | Trading pair |
| `>size` | String | Amount |
| `>orderId` | String | Order ID |
| `>clientOid` | String | Custom id |
| `>baseVolume` | String | Amount of coins traded |
| `>fee` | String | Transaction fee |
| `>price` | String | Order price |
| `>priceAvg` | String | Average order price |
| `>status` | String | Order status. `filled`: All filled / `canceled`: the order is cancelled |
| `>side` | String | Direction. `buy`: buy, `sell`: sell |
| `>force` | String | Order expiration date. `ioc`: Immediate or cancel / `fok`: Fill or kill / `gtc`: Good till canceled / `post_only`: Post only |
| `>totalProfits` | String | Total PnL |
| `>posSide` | String | Position direction. `long` / `short` / `net` |
| `>marginCoin` | String | Margin coin |
| `>quoteVolume` | String | Trading amount in quoting coin |
| `>leverage` | String | Leverage |
| `>marginMode` | String | Margin mode. `isolated`: isolated margin / `crossed`: cross margin |
| `>reduceOnly` | String | Reduce only. `YES`: Yes, `NO`: No |
| `>enterPointSource` | String | Order source. `WEB` / `API` / `SYS` / `ANDROID` / `IOS` |
| `>tradeSide` | String | Direction — same wide enumeration as Get Order Detail |
| `>posMode` | String | Position mode. `one_way_mode` / `hedge_mode` |
| `>orderType` | String | Order type. `limit`: limit order / `market`: market order |
| `>orderSource` | String | Order sources — same long enumeration as Get Order Detail, plus `off_close`: Delisting liquidation |
| `>liqPrice` | String | liquidation price |
| `>cTime` | String | Creation time |
| `>uTime` | String | Last updated time |
| `>presetStopSurplusPrice` | String | Take profit price |
| `>presetStopLossPrice` | String | Stop loss price |
| `>posAvg` | String | Average position price |

> **Doc defect:** the `>force` description on this page carries a stray editor
> note, "(Confirm that if maker is supported)", which is not part of the API
> contract. Verbatim as printed.
>
> **Note:** this page documents only `filled` and `canceled` under `status` —
> no `live` or `partially_filled`, consistent with it being the history endpoint.

## Cancel All Orders

- Rate limit: `Rate limit: 10 req/sec/UID`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/cancel-all-orders`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productType` | String | Yes | `USDT-FUTURES` / `COIN-FUTURES` / `USDC-FUTURES` |
| `marginCoin` | String | No | Margin coin, must be capitalized |
| `requestTime` | String | No | request Time Unix millisecond timestamp — **see the doc-bug note below** |
| `receiveWindow` | String | No | valid window period Unix millisecond timestamp Unix millisecond timestamp — **see the doc-bug note below** |

### Response Parameters

| Parameter | Type | Description |
|---|---|---|
| `successList` | List\<Object\> | The collection of successfully cancelled orders |
| `>orderId` | String | Order ID |
| `>clientOid` | String | Customize order ID |
| `failureList` | List\<Object\> | The collection of unsuccessfully cancelled orders |
| `>orderId` | String | Order ID |
| `>clientOid` | String | Customize order ID |
| `>errorMsg` | String | Failure reason |
| `>errorCode` | String | Error code |

> ### ⚠️ Doc bug: `requestTime` and `receiveWindow` are not request-body parameters
>
> This page is the **only** Trade endpoint that lists `requestTime` and
> `receiveWindow` in its *request parameters* table, and the only one that
> mentions `receiveWindow` at all. Both are wrong in that position:
>
> - **`requestTime` is an output field.** Every one of these 13 endpoints returns
>   `requestTime` in the response envelope (e.g. Flash Close Position returns
>   `"requestTime": 1627293504612`). It is Bitget's server-side echo of the
>   request time — never something a client sends in a body. Its appearance here
>   as an input is a copy-paste error from the response table.
> - **`receiveWindow` does not exist on Bitget.** There is no `recvWindow` and no
>   `receiveWindow` header or body field anywhere in the Classic Futures API
>   (`README.md` states this explicitly: "There is **no** `recvWindow` and **no**
>   `nonce` on Bitget. Bitunix has both; do not port that vocabulary across").
>   The only time-window control is the `ACCESS-TIMESTAMP` signing header. The
>   description text itself is visibly corrupted — "valid window period Unix
>   millisecond timestamp Unix millisecond timestamp" repeats itself.
>
> Both rows are reproduced above verbatim rather than silently dropped, so a
> reader can see exactly what the page claims. **Do not send either field.**

> **Note:** unlike `Cancel Order` and `Batch Cancel`, this endpoint scopes only
> by `productType` and optionally `marginCoin` — there is no `symbol` filter and
> no per-order targeting. Cancelling a narrow slice is a `Batch Cancel` job;
> this one is account-wide for the product type.

## Vocabulary and V1 carry-over traps

**Dead V1 API — never treat as current.** `timInForceValue` and the value
`normal` belong to the decommissioned V1 mix API. Neither appears in any of the
13 V2 Trade pages crawled here; they survive only in stale doc samples and in
Bitget's own shipped Go SDK. Every `/api/mix/v1/…` path answers HTTP 400 with
`code: "30032"`. The current V2 time-in-force field is **`force`**, with
`ioc` / `fok` / `gtc` / `post_only` and `gtc` as the default.

**Wire values for V2.** `productType` is UPPERCASE: `USDT-FUTURES`,
`COIN-FUTURES`, `USDC-FUTURES`. `symbol` is the bare pair (`BTCUSDT`, `ETHUSDT`) —
there is no `_UMCBL` suffix in V2. Margin mode on the wire is `isolated` or
`crossed`, **not** `cross`.

**Where the pages contradict themselves.** The parameter tables consistently say
`isolated` / `crossed` and `YES` / `NO`, but two of the JSON response examples
disagree with their own tables:

| Page | Field | Table says | Example shows |
|---|---|---|---|
| Get Order Detail | `marginMode` | `isolated` / `crossed` | `"marginMode": "cross"` |
| Get Order Detail | `reduceOnly` | `YES` / `NO` | `"reduceOnly": "yes"` |
| Get Pending Orders | `marginMode` | `isolated` / `crossed` | `"marginMode": "cross"` |

The tables are the contract; the examples are stale leftovers. The lowercase
`yes` / `no` in the Get Order Detail example is also what makes the WebSocket
`reduceOnly` mismatch in `07_websocket.md` easy to miss in either direction.

**`force` spelling drift.** Get Order Detail's response table writes the fourth
value as `post only` (with a space) while Place Order, Batch Order, Get Pending
Orders and Get History Order all write `post_only` (with an underscore). The
underscore form is what appears in every request-side table.

## Defect list (this group)

| # | Endpoint | Defect |
|---|---|---|
| 1 | Cancel All Orders | `requestTime` documented as a request body parameter; it is a response field |
| 2 | Cancel All Orders | `receiveWindow` documented as a request body parameter; the field does not exist on Bitget, and its description text is self-duplicated |
| 3 | Flash Close Position | `symbol` marked Required: No despite being the only close scope and present in every example |
| 4 | Flash Close Position | `holdSide` typo: "will be closed **is** the field is filled in" |
| 5 | Flash Close Position | `1 time/1s (User ID)` is the tightest limit in the whole surface, unremarked by the page |
| 6 | Reversal | `tradeSide` value omitted from both "Reversal the current long/short position" description bullets |
| 7 | Batch Order | `tradeSide` capitalised `Open` for long and `open` for short in the same list |
| 8 | Get Order Detail | `pos_loss_limit` listed twice with two different descriptions |
| 9 | Get Order Detail | `force` written `post only` (space) while all other pages use `post_only` |
| 10 | Get Order Detail | Example `marginMode: "cross"` and `reduceOnly: "yes"` contradict the page's own tables |
| 11 | Get Pending Orders | Example `marginMode: "cross"` contradicts the page's own table |
| 12 | Get Pending Orders | Trigger-type fields named `presetStopSurplusTriggerType` / `presetStopLossTriggerType`, vs `…Type` on Get Order Detail |
| 13 | Get Pending Orders | `>status` row has a stray leading space in the field name |
| 14 | Get Order Fill Details | `endId` row duplicated and spliced into the `>cTime` description cell |
| 15 | Get Order Fill Details | Descriptions reference `idGreaterThan`, which is not a documented request parameter |
| 16 | Get Historical Transaction Details | Same duplicated-`endId` rendering artefact |
| 17 | Get Historical Transaction Details | Span is one week vs three months on `/order/fills` — undocumented difference between the two fill endpoints |
| 18 | Get Historical Transaction Details | Page does not document `clientOid` as a request parameter despite the `orderId` description requiring "either orderId or clientOid" |
| 19 | Get History Order | `orderSource` request-parameter enumeration truncated at `pos_loss_market`, far shorter than the same field's response enumeration |
| 20 | Get History Order | `>force` description contains the editor note "(Confirm that if maker is supported)" |
| 21 | Cancel Order | Only Trade page whose rate limit omits the scope word |
| 22 | Place Order / Batch Order / Modify Order / Reversal | Rate limits expressed in five mutually inconsistent formats across the group |

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/04_trade.md`
