# Bitget Classic Futures — Trigger Orders and TP/SL Plan Orders

Source: https://www.bitget.com/legacy-docs/classic/contract/plan/Plan-Sub-Orders
Crawled on: 2026-09-28

The 9 endpoints of the Classic Futures **Trigger Order** group. All are private
and signed; every rate limit on this page is counted **per UID**. Success is
`code: "00000"` inside an HTTP 200.

For a plain order with take-profit and stop-loss attached in a single call, use
`POST /api/v2/mix/order/place-order` with `presetStopSurplusPrice` /
`presetStopLossPrice` instead — see `04_trade.md`. Nothing in this group requires
an order to exist first.

> Cachy wires a subset; see `INTEGRATION_STATUS.md`.

## Two families, one namespace

The sidebar calls this group "Trigger Order", but the nine endpoints are really
**two unrelated families sharing one `planType` field and one URL namespace**.
The catalog labels are also **shifted** relative to the paths: the first two
placements in the sidebar are the TP/SL family, and the trigger-family placement
does not appear until fourth. Read the table below rather than the sidebar
order.

### Family A — plan order (conditional / trailing trigger)

A pending order that sits dormant until `triggerPrice` is touched, then places
a real order. It is a *pending order that has not been submitted yet*.

| `planType` | Meaning (verbatim from `Place-Plan-Order`) |
|---|---|
| `normal_plan` | Trigger order |
| `track_plan` | Trailing stop order |

Endpoints: **Place Trigger Order** (`place-plan-order`), **Modify Trigger
Order** (`modify-plan-order`), **Trigger Sub Order** (`plan-sub-order`),
**Get Pending Trigger Order** (`orders-plan-pending`), **Get History Trigger
Order** (`orders-plan-history`).

### Family B — TP/SL plan order (position-attached protection)

A take-profit, stop-loss or trailing-stop leg that is attached to a position
rather than submitted as an order. Inside Family B there is a further split that
the `size` field decides, not the caller:

| `planType` | Meaning (verbatim from `Place-Tpsl-Order`) | `size` |
|---|---|---|
| `profit_plan` | take profit plan | required, `> 0` |
| `loss_plan` | stop loss plan | required, `> 0` |
| `moving_plan` | trailing stop | required, `> 0` |
| `pos_profit` | position take profit | **not required** |
| `pos_loss` | position stop loss | **not required** |

Endpoints: **Stop-profit and stop-loss plan orders** (`place-tpsl-order`),
**Modify the stop-profit and stop-loss plan order** (`modify-tpsl-order`),
**Simultaneous Stop-profit and stop-loss plan orders** (`place-pos-tpsl`).

### The three shared endpoints

`Cancel-Plan-Order`, `orders-plan-pending` and `orders-plan-history` span both
families and are the only pages that document the full value space.

> **`planType` has four different value spaces across this group.** This is the
> single biggest trap in the group.
>
> | Where | Accepted `planType` values |
> |---|---|
> | `Place Trigger Order` (`place-plan-order`) | `normal_plan`, `track_plan` |
> | `Stop-profit and stop-loss plan orders` (`place-tpsl-order`) | `profit_plan`, `loss_plan`, `moving_plan`, `pos_profit`, `pos_loss` |
> | `Cancel Trigger Order` (`cancel-plan-order`) | all six, no aggregate |
> | `Get Pending` / `Get History` (`orders-plan-pending`, `orders-plan-history`) | `normal_plan`, `track_plan`, **`profit_loss`** |
> | `Trigger Sub Order` (`plan-sub-order`) | `normal_plan`, `track_plan` |
>
> `profit_loss` is **not a real order type**. It is a query-only aggregate
> selector: verbatim, "`profit_loss`: take profit and stop loss orders(including
> the `profit_plan`, `loss_plan`, `moving_plan`, `pos_profit` and `pos_loss`)".
> It exists so a client can read the whole TP/SL book in one call. It is
> accepted by the two query endpoints and by nothing else — sending it to
> `place-plan-order` or `place-tpsl-order` is not documented to work.
>
> And the **response** tables of the two query endpoints, plus
> `plan-sub-order`, document `>planType` as only `normal_plan` or `track_plan` —
> so a `planType=profit_loss` query returns rows whose `planType` the schema
> says cannot exist. See [defect 1](#defect-list-this-group).

## Overview

| # | Endpoint | Method | Auth | Rate limit (as printed) |
|---|---|---|---|---|
| 1 | Trigger Sub Order | `GET` | private (signed) | `Rate limit: 10 req/sec/UID` |
| 2 | Stop-profit and stop-loss plan orders | `POST` | private (signed) | `Speed limit is 10 times/s (UID)` |
| 3 | Simultaneous Stop-profit and stop-loss plan orders | `POST` | private (signed) | `Speed limit is 10 times/s (UID)` |
| 4 | Place Trigger Order | `POST` | private (signed) | `Rate limit: 10 req/sec/UID` |
| 5 | Modify the stop-profit and stop-loss plan order | `POST` | private (signed) | `Speed limit is 10 times/s (UID)` |
| 6 | Modify Trigger Order | `POST` | private (signed) | `Speed limit is 10 times/s (UID)` |
| 7 | Get Pending Trigger Order | `GET` | private (signed) | `Rate limit: 10 req/sec/UID` |
| 8 | Cancel Trigger Order | `POST` | private (signed) | `Speed limit is 10 times/s (UID)` |
| 9 | Get History Trigger Order | `GET` | private (signed) | `Speed limit is 10 times/s (UID)` |

All nine print a limit, in two renderings: `Rate limit: 10 req/sec/UID` (4
pages) and `Speed limit is 10 times/s (UID)` (5 pages). The five
`Speed limit is 10 times/s (UID)` pages also drop the "for average users.
Frequency limit imposed according to user ID" tail that the Trade group uses,
but keep the `(UID)` scope. Neither rendering has been normalised here.

## Field-name divergences inside the group

Same concept, different field name depending on which family you are in:

| Concept | Family A (`*plan-order`) | Family B (`*tpsl-order`) |
|---|---|---|
| trailing-stop callback rate | `callbackRatio` / `newCallbackRatio` | `rangeRate` |
| trigger type field | `triggerType` / `newTriggerType` | `triggerType` |
| trigger type values | `mark_price`, `fill_price` | `fill_price`, `mark_price` |
| TP/SL leg fields | `stopSurplusTriggerPrice` etc. (on the parent order) | `triggerPrice` + `planType` |
| position direction | `side` + `tradeSide` + `posSide` | `holdSide` only |

`holdSide` deserves its own note. It appears **only** on the two
`place-tpsl*` endpoints, and its value space depends on position mode — verbatim
from both pages: "Two-way position:(`long`: long position, `short`: short
position) one-way position: (`buy`: long position, `sell`: short position)". So
`holdSide` is `long`/`short` in hedge mode and `buy`/`sell` in one-way mode — a
*third* position-direction convention, distinct from both the Trade group's
`side`/`tradeSide` pair and Flash Close Position's numeric `holdSide`. Family A
does not use `holdSide` at all; it reuses the Trade group's `side`/`tradeSide`
bullets verbatim.

## Trigger Sub Order

- Rate limit: `Rate limit: 10 req/sec/UID`
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/order/plan-sub-order`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `planType` | String | Yes | Trigger order type. `normal_plan`: average trigger order / `track_plan`: trailing stop order |
| `planOrderId` | String | Yes | Trigger order ID |
| `productType` | String | Yes | `USDT-FUTURES` USDT-M Futures / `COIN-FUTURES` Coin-M Futures / `USDC-FUTURES` USDC-M Futures |

### Response Parameters

`data` is an **array**.

| Parameter | Type | Description |
|---|---|---|
| `orderId` | String | Futures order ID |
| `price` | String | Price of the futures order |
| `type` | String | Order type. `limit` / `market` |
| `status` | String | Plan order trigger status. `success`: trigger success / `fail`: trigger failed / `cancelled`: cancelled / `in_progress`: trigger spot placing order / `in_progress_tracking`: tracking trigger |

> **Note:** this is the only Family A endpoint that shows what a triggered plan
> became — the concrete futures `orderId` and `price` that were actually
> submitted. `Get History Trigger Order` exposes the same link as
> `executeOrderId`.
>
> **Doc defect:** `cancelled` is spelled with two `l`s here and in
> `orders-plan-history`, while the Trade group's order status uses `canceled`
> with one. Also note `in_progress` is snake_case, out of step with the
> lowerCamel `normal_plan` style used in the same group.

## Stop-profit and stop-loss plan orders

- Rate limit: `Speed limit is 10 times/s (UID)`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/place-tpsl-order`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `marginCoin` | String | Yes | Margin currency (Capitalized) |
| `productType` | String | Yes | `USDT-FUTURES` USDT-M Futures / `COIN-FUTURES` Coin-M Futures / `USDC-FUTURES` USDC-M Futures |
| `symbol` | String | Yes | Trading pair, e.g. ETHUSDT |
| `planType` | String | Yes | Take profit and stop loss type. `profit_plan`: take profit plan; `loss_plan`: stop loss plan; `moving_plan`: trailing stop; `pos_profit`: position take profit; `pos_loss`: position stop loss |
| `triggerPrice` | String | Yes | Trigger price |
| `triggerType` | String | No | Trigger type. `fill_price`: market price; `mark_price`: mark price |
| `executePrice` | String | No | Execution price. If it is 0 or not filled in, it means market price execution. If it is greater than 0, it means limit price execution. **Do not fill in this parameters when `planType` is `moving_plan`, it only executs in market price.** |
| `holdSide` | String | Yes | Two-way position: (`long`: long position, `short`: short position) one-way position: (`buy`: long position, `sell`: short position) |
| `size` | String | Yes | Order quantity(base coin). **It's required when `planType` is `profit_plan`, `loss_plan` or `moving_plan`, and should be greater than 0; It's NOT required when `planType` is `pos_profit` or `pos_loss`** |
| `rangeRate` | String | No | Callback range. **It's required only in `planType` is `moving_plan`** |
| `clientOid` | String | No | Customize order ID |
| `stpMode` | String | No | STP Mode, default `none`. `none` not setting STP / `cancel_taker` cancel taker order / `cancel_maker` cancel maker order / `cancel_both` cancel both of taker and maker orders |

### Response Parameters

`data` is an **object**.

| Parameter | Type | Description |
|---|---|---|
| `orderId` | String | Trigger order ID |
| `clientOid` | String | Customized trigger order ID |

> **Doc defect:** the example request body on this page is
> `{"marginCoin": "USDT","productType": "usdt-futures","symbol": "ethusdt",…}` —
> lowercased `productType` and `symbol`, contradicting the parameter table's
> `USDT-FUTURES` / `ETHUSDT` and the whole V2 vocabulary. Same defect on
> `place-pos-tpsl`, `modify-tpsl-order`, `modify-plan-order` and
> `cancel-plan-order`. `place-plan-order`, `plan-sub-order`,
> `orders-plan-pending` and `orders-plan-history` get it right in the example.
>
> `size` is marked **Required: Yes** in the table while the description makes it
> conditional on `planType`. For `pos_profit` / `pos_loss` it must be omitted or
> empty, not merely small.

## Simultaneous Stop-profit and stop-loss plan orders

- Rate limit: `Speed limit is 10 times/s (UID)`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/place-pos-tpsl`

This endpoint places a take-profit and a stop-loss **against one position leg in
a single request**, and — uniquely in this group — **has no `planType` field at
all**. The family is selected implicitly by whether you supply a size.

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `marginCoin` | String | Yes | Margin currency |
| `productType` | String | Yes | `USDT-FUTURES` USDT-M Futures / `COIN-FUTURES` Coin-M Futures / `USDC-FUTURES` USDC-M Futures |
| `symbol` | String | Yes | Trading pair, e.g. ETHUSDT |
| `stopSurplusTriggerPrice` | String | No | Take Profit Trigger price |
| `stopSurplusSize` | String | No | Order quantity(base coin)，**if filled it's `profit_plan`, if not filled，it's `pos_profit`** |
| `stopSurplusTriggerType` | String | No | Take Profit Trigger type. `fill_price`: market price; `mark_price`: mark price |
| `stopSurplusExecutePrice` | String | No | Take Profit Execution price. If it is 0 or not filled in, it means market price execution. If it is greater than 0, it means limit price execution. |
| `stopLossTriggerPrice` | String | No | Stop Loss Trigger price |
| `stopLossSize` | String | No | Order quantity(base coin)，**if filled it's `loss_plan`，if not filled，it's `pos_loss`** |
| `stopLossTriggerType` | String | No | Stop Loss Trigger type. `fill_price`: market price; `mark_price`: mark price |
| `stopLossExecutePrice` | String | No | Stop Loss Execution price. If it is 0 or not filled in, it means market price execution. If it is greater than 0, it means limit price execution. |
| `holdSide` | String | Yes | Two-way position: (`long`: long position, `short`: short position) one-way position: (`buy`: long position, `sell`: short position) |
| `stpMode` | String | No | STP Mode, default `none`. `none` not setting STP / `cancel_taker` cancel taker order / `cancel_maker` cancel maker order / `cancel_both` cancel both of taker and maker orders |
| `stopSurplusClientOid` | String | No | Take-profit order custom order ID |
| `stopLossClientOid` | String | No | Stop-loss order custom order ID |

### Response Parameters

**`data` is an array** — the only placement endpoint in this group that returns
one, alongside `plan-sub-order`.

| Parameter | Type | Description |
|---|---|---|
| `orderId` | String | Trigger order ID |
| `stopSurplusClientOid` | String | Take-profit order custom order ID |
| `stopLossClientOid` | String | Stop-loss order custom order ID |

> ### ⚠️ The array shape is not documented
>
> The response example is:
>
> ```json
> { "code": "00000",
>   "data": [
>     { "orderId": "xxxxxxxx", "stopSurplusClientOid": "xxxxxxxx", "stopLossClientOid": "xxxxxxxx" },
>     { "orderId": "xxxxxxxx", "stopSurplusClientOid": "xxxxxxxx", "stopLossClientOid": "xxxxxxxx" }
>   ],
>   "msg": "success", "requestTime": 1627293504612 }
> ```
>
> The **request** names exactly one position leg (`holdSide: "long"`) with one TP
> and one SL, yet the response contains **two** array entries, each carrying a
> single `orderId` plus **both** client-oids. The response parameter table
> documents three flat fields with no `>` element prefix, so it describes the
> *contents* of an element but never the **element count** or what each element
> corresponds to.
>
> Two readings are possible and the page supports neither over the other: one
> element per *leg* (TP entry + SL entry, each echoing both oids), or one element
> per *position side*. **This was not resolvable from the live page.** A client
> that assumes `data[0]` is the TP order and `data[1]` the SL order is making an
> assumption the documentation does not license. Treat the array as
> "zero or more created order records" and read `orderId` from every element.
>
> This is the second of the two endpoints in the group returning an array; the
> other is `plan-sub-order`. Every other endpoint here returns an **object**.

## Place Trigger Order

- Rate limit: `Rate limit: 10 req/sec/UID`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/place-plan-order`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `planType` | String | Yes | Trigger order type. `normal_plan`: Trigger order / `track_plan`: Trailing stop order |
| `symbol` | String | Yes | Trading pair, e.g. ETHUSDT |
| `productType` | String | Yes | `USDT-FUTURES` USDT-M Futures / `COIN-FUTURES` Coin-M Futures / `USDC-FUTURES` USDC-M Futures |
| `marginMode` | String | Yes | Position mode. `isolated`: isolated margin / `crossed`: cross margin |
| `marginCoin` | String | Yes | Margin coin |
| `size` | String | Yes | Amount(base coin) |
| `price` | String | No | Price. 1\. For `track_plan`, it must be empty. 2\. For `normal_plan`, it is required when orderType is `limit`; It must be empty when orderType is `market`. |
| `callbackRatio` | String | No | Callback rate (applies to trailing stop orders only). 1\. Required for trailing stop orders and the rate cannot be greater than 10. |
| `triggerPrice` | String | Yes | Trigger price |
| `triggerType` | String | **Yes** | Trigger type. 1\. Required when placing a trigger order or a trailing stop order. `mark_price`: Mark price / `fill_price`: Lastest price |
| `side` | String | Yes | Order direction. `buy`; `sell` |
| `tradeSide` | String | No | Direction. `open`: Open; `close`: Close. 1\. Only required in hedge position mode. Notes: For open long, "side" fill in "buy"; tradeSide should be "open" — For open short, "side" fill in "sell"; tradeSide should be "open" — For close long, "side" fill in "buy"; "tradeSide" should be "close" — For close short, "side" fill in "sell"; "tradeSide" should be "close" |
| `orderType` | String | Yes | Order type. `limit`: limit order / `market`: market order. 1\. For `track_plan`, it is required and must be `market` |
| `clientOid` | String | No | Customize order ID |
| `reduceOnly` | String | No | Whether or not to just reduce the position. `yes`: Yes; `no`: No(default). 1\. Only applicable in buy/sell (one-way position) mode |
| `stopSurplusTriggerPrice` | String | No | Take-profit trigger price/Take-profit trigger percentage return rate. 1\. For `normal_plan`, it represents the take-profit trigger price 2\. For `track_plan`, it represents the take-profit percentage, with a maximum of 999.99 and a minimum of 0.01 3\. If left empty or set to 0, no take-profit will be set by default |
| `stopSurplusExecutePrice` | String | No | Take-profit execute price. 1\. For `track_plan`, it must be empty. 2\. For a `normal_plan` that has stopSurplusTriggerPrice parameter set, if it is empty or set to 0, it represents a market order execution; if not empty and greater than 0, it represents a limit order execution |
| `stopSurplusTriggerType` | String | No | Take-profit trigger type. `fill_price`: Lastest price / `mark_price`: Mark price. 1\. For orders that have stopSurplusTriggerPrice parameter set, it is required 2\. For `track_plan`, it only accepts `fill_price` |
| `stopLossTriggerPrice` | String | No | Stop-loss trigger price/Stop-loss trigger percentage return rate. 1\. For `normal_plan`, it represents the stop-loss trigger price 2\. For `track_plan`, it represents the stop-loss percentage, with a maximum of 999.99 and a minimum of 0.01 3\. If left empty or set to 0, no stop-loss will be set by default |
| `stopLossExecutePrice` | String | No | Stop-loss execute price. 1\. For `track_plan`, it must be empty. 2\. For a `normal_plan` that has stopLossTriggerPrice parameter set, if it is empty or set to 0, it represents a market order execution; if not empty and greater than 0, it represents a limit order execution |
| `stopLossTriggerType` | String | No | Stop-loss trigger type. `fill_price`: Lastest price / `mark_price`: Mark price. 1\. For orders that have stopLossTriggerPrice parameter set, it is required 2\. For `track_plan`, it only accepts `fill_price` |
| `stpMode` | String | No | STP Mode. `none` not setting STP(default) / `cancel_taker` cancel taker order / `cancel_maker` cancel maker order / `cancel_both` cancel both of taker and maker orders |

### Response Parameters

`data` is an **object**.

| Parameter | Type | Description |
|---|---|---|
| `orderId` | String | Trigger order ID |
| `clientOid` | String | Customized trigger order ID |

> **Doc defect:** the example request body sends `presetStopSurplusPrice` and
> `presetStopLossPrice`, which appear **nowhere in this page's parameter
> table**. Those are Trade-group fields (see `04_trade.md`); the documented
> equivalents here are `stopSurplusTriggerPrice` / `stopLossTriggerPrice`. The
> example is mixing the two families.
>
> **Doc defect:** `reduceOnly` is documented as lowercase `yes` / `no` here,
> while the example body sends `"reduceOnly": "NO"` and the Trade group uses
> `YES` / `NO`. Three different renderings of one flag inside one API.
>
> **Doc defect:** `triggerType` is **Required: Yes** on this page but
> **Required: No** on `place-tpsl-order` for the same purpose.
>
> **Note:** this endpoint can itself carry TP/SL (`stopSurplusTriggerPrice` and
> the loss equivalents) *in addition to* its own trigger — so a conditional
> order can carry a second, independent conditional exit. That is a third way
> to attach TP/SL, after `place-order`'s `presetStop*` fields and Family B's
> standalone plans.
>
> **Note:** for `track_plan`, `stopSurplusTriggerPrice` is a **percentage**
> (0.01–999.99), not a price, and `stopSurplusTriggerType` accepts only
> `fill_price`. A trailing stop cannot use `mark_price` for its TP/SL legs.

## Modify the stop-profit and stop-loss plan order

- Rate limit: `Speed limit is 10 times/s (UID)`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/modify-tpsl-order`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | String | No | Take profit and stop loss order number, 'orderId' and 'clientOid' must provide one |
| `clientOid` | String | No | Take profit and stop loss client order number, 'orderId' and 'clientOid' must provide one |
| `marginCoin` | String | Yes | Margin currency |
| `productType` | String | Yes | `USDT-FUTURES` USDT-M Futures / `COIN-FUTURES` Coin-M Futures / `USDC-FUTURES` USDC-M Futures |
| `symbol` | String | Yes | Trading pair, e.g. ETHUSDT |
| `triggerPrice` | String | Yes | trigger price |
| `triggerType` | String | No | Trigger type (`fill_price` (transaction price) `mark_price` (mark price) |
| `executePrice` | String | No | Execution price (if it is 0 or not filled in, it means market price execution. If it is greater than 0, it means limit price execution. When planType (stop-profit and stop-loss type) is `moving_plan` (moving take-profit and stop-loss), it is not filled in and is fixed to the market price. implement.) |
| `size` | String | Yes | Order quantity. **For the position take profit and position stop loss orders, the size should be `"size":""`** |
| `rangeRate` | String | No | callback range |

### Response Parameters

`data` is an **object**.

| Parameter | Type | Description |
|---|---|---|
| `orderId` | String | Trigger order ID |
| `clientOid` | String | Customized trigger order ID |

> **Note:** there is **no `planType` parameter** — the endpoint infers the family
> from the order you are amending, so the Family A / Family B split is invisible
> here. `planType` appears only in the `executePrice` prose, explaining the
> `moving_plan` case.
>
> **Note:** unlike `modify-plan-order`, this endpoint has **no `new`-prefixed
> variants** — the fields are the bare `triggerPrice` / `triggerType` /
> `executePrice` / `size` / `rangeRate`. There is also no documented way to
> *delete* a TP/SL here; `modify-plan-order` and Trade's `modify-order` both
> document `0` as the delete sentinel, this page does not.
>
> **Doc defect:** the `triggerType` description is missing its closing
> parenthesis — "Trigger type (fill_price (transaction price) mark_price (mark
> price". The `executePrice` description ends in a stray "implement.".
>
> **Doc defect:** `marginCoin` is documented here as plain "Margin currency" with
> no capitalisation note, where `place-tpsl-order` says "Margin currency
> (Capitalized)" and `cancel-plan-order` says "Margin coin must be capitalized".

## Modify Trigger Order

- Rate limit: `Speed limit is 10 times/s (UID)`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/modify-plan-order`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | String | No | Trigger order ID. Either orderId or clientOid is required. If both are entered, orderId prevails. |
| `clientOid` | String | No | Customized trigger order ID. Either orderId or clientOid is required. If both are entered, orderId prevails. |
| `productType` | String | Yes | `USDT-FUTURES` USDT-M Futures / `COIN-FUTURES` Coin-M Futures / `USDC-FUTURES` USDC-M Futures |
| `newSize` | String | No | Amount of the modified transaction. If it is empty, the amount remains unchanged. |
| `newPrice` | String | No | Modified price for executing orders. 1: When the original order is a trigger order and its type is Limit, the original price remains unchanged when this field is empty. Must be empty if the order type is Market. 2: When the original order is a trailing order, it must be empty. |
| `newCallbackRatio` | String | No | Modified callback rate (for trailing stop orders only). 1\. When the original order is a trailing stop order, it must be filled in, and the rate must not be greater than 10. 2: When the original order is a trigger order, it must be empty. |
| `newTriggerPrice` | String | No | Modified trigger price. 1\. When the original order is a trigger order or a trailing stop order, if the field is not set, the price stays unchanged; if it is set, the price updates. |
| `newTriggerType` | String | No | Modified trigger type. 1\. When the original order is a trigger order or a trailing stop order, if the field is not set, the type stays unchanged; if it is set, the type updates. **Setting this parameter requires the setting of newTriggerPrice.** `fill_price`: filled price / `mark_price`: mark price |
| `newStopSurplusTriggerPrice` | String | No | Modified take-profit trigger price. 1\. If the field is left empty: when the original order has the TP set, the original value will be maintained. 2\. If it is not empty: when the original order has the TP set, the TP will update; when the original order doesn't have the TP set, the TP will be added. **If 0 is filled in, the original TP setting will be removed.** |
| `newStopSurplusExecutePrice` | String | No | Modified take-profit strike price. 1\. This parameter must be empty when the original order is a trailing stop order. 2\.For a trigger order, if this field is filled in, the price will update; if not filled in, the price stays unchanged; **if 0 is filled in, the price setting will be removed.** |
| `newStopSurplusTriggerType` | String | No | Modified take-profit trigger type. Default to the transaction price. 1\. This parameter must be empty when the original order is a trailing stop order. 2\. For a trigger order that has newStopSurplusTriggerPrice parameter set, it is required. `fill_price`: filled price / `mark_price`: mark price |
| `newStopLossTriggerPrice` | String | No | Modified stop-loss trigger price. 1\. If the field is left empty: when the original order has the SL set, the original value will be maintained. 2\. If it is not empty: when the original order has the SL set, the SL will update; when the original order doesn't have the SL set, the SL will be added. **If 0 is filled in, the original SL setting will be removed.** |
| `newStopLossExecutePrice` | String | No | Modified stop-loss strike price. 1\. This parameter must be empty when the original order is a trailing stop order. 2\.For a trigger order, if this field is filled in, the price will update; if not filled in, the price stays unchanged; **if 0 is filled in, the SL setting will be removed.** |
| `newStopLossTriggerType` | String | No | Modified stop-loss trigger type. Default to the transaction price. 1\. This parameter must be empty when the original order is a trailing stop order. 2\. For a trigger order that has newStopLossTriggerPrice parameter set, it is required. `fill_price`: filled price / `mark_price`: mark price |

### Response Parameters

`data` is an **object**.

| Parameter | Type | Description |
|---|---|---|
| `orderId` | String | Trigger order ID |
| `clientOid` | String | Customized trigger order ID |

> **Doc defect:** the example request body sends `planType` and `symbol`, and
> **neither appears in the parameter table**. `planType` is not modifiable per
> this schema, yet the example passes `"planType":"normal_plan"`. Do not rely on
> the example for the request shape.
>
> **Note:** every amendable field here is `new`-prefixed — the inverse of
> `modify-tpsl-order`, which has no prefix. The two modify endpoints in the
> same group are therefore not interchangeable in shape.

## Get Pending Trigger Order

- Rate limit: `Rate limit: 10 req/sec/UID`
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/order/orders-plan-pending`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | String | No | Trigger order ID. Either orderId or clientOid is required. If both are entered, orderId prevails. |
| `clientOid` | String | No | Customized trigger order ID. Either orderId or clientOid is required. If both are entered, orderId prevails. |
| `symbol` | String | No | Trading pair, e.g. ETHUSDT |
| `planType` | String | **Yes** | Trigger order type. `normal_plan`: average trigger order / `track_plan`: trailing stop order / **`profit_loss`: take profit and stop loss orders(including the `profit_plan`, `loss_plan`, `moving_plan`, `pos_profit` and `pos_loss`)** |
| `symbol` | String | No | Trading pair, e.g. ETHUSDT — **duplicated row, see defect list** |
| `productType` | String | Yes | `USDT-FUTURES` USDT-M Futures / `COIN-FUTURES` Coin-M Futures / `USDC-FUTURES` USDC-M Futures |
| `idLessThan` | String | No | Requests the content on the page before this ID (older data), the value input should be the endId of the corresponding interface. |
| `startTime` | String | No | Start timestamp. Unix timestamp in milliseconds format, e.g. 1597026383085. (The maximum time span supported is three months. The default end time is three months if no value is set for the end time.) |
| `endTime` | String | No | End timestamp. Unix timestamp in milliseconds format, e.g. 1597026383085. (The maximum time span supported is three months. The default start time is three months ago if no value is set for the start time.) |
| `limit` | String | No | Number of queries: Default: 100, maximum: 100 |

### Response Parameters

`data` is an **object** containing `entrustedList` and `endId`.

| Parameter | Type | Description |
|---|---|---|
| `entrustedList` | List\<Object\> | Order list |
| `>planType` | String | Trigger order type. `normal_plan`: average trigger order / `track_plan`: trailing stop order |
| `>symbol` | String | Trading pair |
| `>size` | String | Amount |
| `>orderId` | String | Trigger order ID |
| `>clientOid` | String | Customized trigger order ID |
| `>price` | String | Order execute price. For a common trigger order, it represents the order execute price. For a trailing stop order, the value doesn't exist. |
| `>executePrice` | String | Execute Price |
| `>callbackRatio` | String | Implementation of the callback rate. (Range 1-10) Only exists when the order is a trailing stop order. |
| `>triggerPrice` | String | Trigger price. It appears for both common trigger orders and trailing stop orders. |
| `>triggerType` | String | Trigger type. It appears for both common trigger orders and trailing stop orders. `fill_price`: filled price / `mark_price`: mark price / **`index_price`: index price** |
| `>planStatus` | String | Order status. For a current trigger order, the status will only be `live` |
| `>side` | String | Direction. Buy; Sell |
| `>posSide` | String | Position direction. `long`: hedge mode long position / `short`: hedge mode short position / `net`: one-way position |
| `>marginCoin` | String | Margin coin |
| `>marginMode` | String | Margin mode. `isolated`: isolated margin mode / `crossed`: crossed margin |
| `>enterPointSource` | String | Order source. `WEB`: Orders created on the website / `API`: Orders created on API / `SYS`: System managed orders, usually generated by forced liquidation logic / `ANDROID`: Orders created on the Android app / `IOS`: Orders created on the iOS app |
| `>tradeSide` | String | Direction. `open`: Open (hedge-mode) / `close`: Close (hedge-mode) |
| `>posMode` | String | Position mode. `one_way_mode`: one-way mode / `hedge_mode`: hedge mode |
| `>orderType` | String | Order type. `limit`: limit order / `market`: market order |
| `>orderSource` | String | Order sources — see the shortened enumeration below |
| `>cTime` | String | Creation time |
| `>uTime` | String | Last updated |
| `>stopSurplusExecutePrice` | String | Setting take profit execution price |
| `>stopSurplusTriggerPrice` | String | Setting take-profit trigger price |
| `>stopSurplusTriggerType` | String | Setting take-profit trigger type. `fill_price`: filled price / `mark_price`: mark price / **`index_price`: index price** |
| `>stopLossExecutePrice` | String | Setting stop loss execution price |
| `>stopLossTriggerPrice` | String | Setting stop-loss trigger price |
| `>stopLossTriggerType` | String | Setting stop-loss trigger type. `fill_price`: filled price / `mark_price`: mark price / **`index_price`: index price** |
| `endId` | String | This is used when idLessThan/idGreaterThan is set as a range. |

`>orderSource` values on this page (verbatim) — note this is a **shortened** list
compared with the ~50-value enumeration in the Trade group:

`normal`, `market`, `profit_market`, `loss_market`, `Trader_delegate`,
`trader_profit`, `trader_loss`, `trader_reverse`, `profit_limit`, `loss_limit`,
`delivery_close_short`, `pos_profit_limit`, `pos_profit_market`,
`pos_loss_limit`, `pos_loss_market`.

> **Doc defect:** the request parameter table lists `symbol` **twice** —
> once between `clientOid` and `planType`, and again between `planType` and
> `productType`. Identical name, type and description both times. A rendering
> artefact, not two different parameters.
>
> **Doc defect:** `>planType` is documented as only `normal_plan` or
> `track_plan`, yet the same page's **request** parameter accepts
> `profit_loss` — so a `profit_loss` query provably returns Family B rows whose
> `planType` the response table says does not exist. See [defect 1](#defect-list-this-group).
>
> **Doc defect:** the response example is lowercased throughout —
> `"symbol": "ethusdt"`, `"marginCoin": "usdt"`, `"enterPointSource": "api"` —
> contradicting the table's `ETHUSDT` / capitalised `enterPointSource` values.
>
> **Doc defect:** `index_price` is offered as a `triggerType` /
> `stopSurplusTriggerType` / `stopLossTriggerType` value **only here**. Neither
> placement endpoint accepts it, and the history endpoint's identical fields
> omit it. See [defect 4](#defect-list-this-group).

## Cancel Trigger Order

- Rate limit: `Speed limit is 10 times/s (UID)`
- Auth: `private (signed)`

### HTTP Request

`POST /api/v2/mix/order/cancel-plan-order`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderIdList` | List | No | Trigger order id list. If it is passed, symbol must not be null and must be aligned with symbol/productType/planType. |
| `>orderId` | String | No | Trigger order ID. Either orderId or clientOid is required. If both are entered, orderId prevails. |
| `>clientOid` | String | No | Customized trigger order ID. Either orderId or clientOid is required. **If both are entered, triggerId prevails.** |
| `symbol` | String | No | Trading pair, e.g. ETHUSDT |
| `productType` | String | Yes | `USDT-FUTURES` USDT-M Futures / `COIN-FUTURES` Coin-M Futures / `USDC-FUTURES` USDC-M Futures |
| `marginCoin` | String | No | Margin coin must be capitalized |
| `planType` | String | No | Trigger order type. `normal_plan` plan order(default) / `profit_plan` batch profit order / `loss_plan` batch loss order / `pos_profit` position profit order / `pos_loss` position loss order / `moving_plan` trailing order |

### Response Parameters

`data` is an **object**.

| Parameter | Type | Description |
|---|---|---|
| `successList` | List\<Object\> | The collection of successfully cancelled orders. |
| `> orderId` | String | Order ID |
| `> clientOid` | String | Customize order ID |
| `failureList` | List\<Object\> | The collection of unsuccessfully cancelled orders. |
| `> orderId` | String | Order ID |
| `> clientOid` | String | Customize order ID |
| `>errorMsg` | String | Failure reason |

> **This is the only page in the whole API that lists all six `planType`
> values together** — and its descriptions are worded differently from every
> other page. Compare:
>
> | `planType` | `place-plan-order` | `place-tpsl-order` | `cancel-plan-order` |
> |---|---|---|---|
> | `normal_plan` | Trigger order | — | plan order (default) |
> | `track_plan` | Trailing stop order | — | — |
> | `profit_plan` | — | take profit plan | **batch profit order** |
> | `loss_plan` | — | stop loss plan | **batch loss order** |
> | `moving_plan` | — | trailing stop | **trailing order** |
> | `pos_profit` | — | position take profit | **position profit order** |
> | `pos_loss` | — | position stop loss | **position loss order** |
>
> `moving_plan` is described as "trailing stop" on placement and "trailing
> order" here; `normal_plan` is "Trigger order" and "plan order". Same values,
> five different descriptions. See [defect 2](#defect-list-this-group).
>
> **Doc bug:** the `>clientOid` description says "If both are entered,
> **`triggerId`** prevails" — but there is no `triggerId` field on this endpoint
> or anywhere in the group. It means `orderId`.
>
> **Doc defect:** `failureList` documents **no `errorCode`**, unlike every Trade
> failure list (`batch-place-order`, `batch-cancel-orders`, `close-positions`),
> all of which carry `errorMsg` **and** `errorCode`. A client parsing failures
> generically will find the field missing here.
>
> **Doc defect:** the example's `failureList` entries both read
> `"errorMsg": "notExistend"` — a misspelling of "notExistent", reproduced
> verbatim. Also note `cancelled`/`canceled` spelling drift against the Trade
> group.
>
> **Doc defect:** the description contains a missing-space typo: "All orders
> that fall under that'productType' and 'symbol' will be cancelled."
>
> **Note:** the response table writes its element fields as `> orderId` and
> `> clientOid` **with a leading space** after `>`, while `>errorMsg` has none.
>
> **Note:** `planType` is optional here and defaults to `normal_plan`, so a
> cancel without it only touches Family A orders. To clear TP/SL plans you must
> pass a Family B `planType` or cancel by explicit `orderIdList`.

## Get History Trigger Order

- Rate limit: `Speed limit is 10 times/s (UID)`
- Auth: `private (signed)`

### HTTP Request

`GET /api/v2/mix/order/orders-plan-history`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | String | No | Order ID. Either orderId or clientOid is required. If both are entered, orderId prevails. |
| `clientOid` | String | No | Customize order ID. Either orderId or clientOid is required. If both are entered, orderId prevails. |
| `planType` | String | **Yes** | Order type. `normal_plan`: trigger order / `track_plan`: trailing stop order / **`profit_loss`: take profit and stop loss orders(including the `profit_plan`, `loss_plan`, `moving_plan`, `pos_profit` and `pos_loss`)** |
| `planStatus` | String | No | Trigger order status. If not specified, all states will be queried. `executed`: the order triggered / `fail_execute`: Failed to trigger / `cancelled`: Cancelled |
| `symbol` | String | No | Trading pair, e.g. ETHUSDT |
| `productType` | String | Yes | `USDT-FUTURES` USDT-M Futures / `COIN-FUTURES` Coin-M Futures / `USDC-FUTURES` USDC-M Futures |
| `idLessThan` | String | No | Requests the content on the page before this ID (older data), the value input should be the endId of the corresponding interface. |
| `startTime` | String | No | Start timestamp. Unix timestamp in milliseconds format, e.g. 1597026383085. (The maximum time span supported is three months. The default end time is three months if no value is set for the end time.) (For Managed Sub-Account, the StartTime cannot be earlier than the binding time) |
| `endTime` | String | No | End timestamp. Unix timestamp in milliseconds format, e.g. 1597026383085. (The maximum time span supported is three months. The default start time is three months ago if no value is set for the start time.) |
| `limit` | String | No | Number of queries: Default: 100, maximum: 100 |

### Response Parameters

`data` is an **object** containing `entrustedList` and `endId`.

| Parameter | Type | Description |
|---|---|---|
| `entrustedList` | List\<Object\> | Order list |
| `>planType` | String | Trigger order type. `normal_plan`: average trigger order / `track_plan`: trailing stop order |
| `>symbol` | String | Trading pair |
| `>size` | String | Amount |
| `>orderId` | String | Trigger order ID |
| `>executeOrderId` | String | the order ID after plan triggered |
| `>clientOid` | String | Customized trigger order ID |
| `>planStatus` | String | Order status. `executed`: the order triggered / `fail_execute`: Failed to trigger / `cancelled`: Cancelled |
| `>price` | String | Order price. For a common trigger order, it represents the order price. For a trailing stop order, this field doesn't exist. |
| `>executePrice` | String | Execute Price |
| `>baseVolume` | String | Amount of coins traded. It is only available when the order status is triggered. |
| `callbackRatio` | String | Implementation of the callback rate. (Maximum 1-10) Only exists for trailing stop orders. — **missing the `>` element prefix, see defect list** |
| `>triggerPrice` | String | Trigger price. It appears for both common trigger orders and trailing stop orders. |
| `>triggerType` | String | Trigger type. It appears for both common trigger orders and trailing stop orders. `fill_price`: filled price / `mark_price`: mark price — **no `index_price` here, unlike the pending endpoint** |
| `>side` | String | Direction. Buy; Sell |
| `>posSide` | String | Position direction. `long`: hedge mode long position / `short`: hedge mode short position / `net`: one-way position |
| `>marginCoin` | String | Margin coin |
| `>marginMode` | String | Margin mode. `isolated`: isolated margin / `crossed`: cross margin |
| `>enterPointSource` | String | Order source. `WEB` / `API` / `SYS` / `ANDROID` / `IOS` — orders created on the website, on API, system managed orders (usually forced liquidation logic), on the Android app, on the iOS app |
| `>tradeSide` | String | Direction. `open` (open and close mode) / `close`: Close (open and close mode) |
| `>posMode` | String | Position mode. `one_way_mode`: one-way mode / `hedge_mode`: hedge mode |
| `>orderType` | String | Order type. `limit`: limit order / `market` |
| `>cTime` | String | Creation time |
| `>uTime` | String | Last updated time |
| `>stopSurplusExecutePrice` | String | Setting take-profit strike price |
| `>stopSurplusTriggerPrice` | String | Setting take-profit trigger price |
| `>stopSurplusTriggerType` | String | Setting take-profit trigger type. `fill_price`: filled price / `mark_price`: mark price — **no `index_price`** |
| `>stopLossExecutePrice` | String | Setting stop-loss strike price |
| `>stopLossTriggerPrice` | String | Setting stop-loss trigger price |
| `>stopLossTriggerType` | String | Setting stop-loss trigger type. `fill_price`: filled price / `mark_price`: mark price — **no `index_price`** |
| `endId` | String | The last Trigger order ID. This is used when idLessThan/idGreaterThan is set as a range. |

> **Doc defect:** the response example contains `"priceAvg": "1999.2"`, which
> **is not documented anywhere in the parameter table** on this page.
>
> **Doc defect:** `baseVolume` and `callbackRatio` are written **without** the
> `>` array-element prefix while every one of their neighbours has it, so the
> table is ambiguous about whether they are per-element or envelope-level.
>
> **Doc defect:** `>tradeSide` is glossed "open (open and close mode) / close:
> Close (open and close mode)" here, while the pending endpoint says
> "`open`: Open (hedge-mode) / `close`: Close (hedge-mode)" for the same field.
> `hedge-mode` and `one-way-mode` are the terms Bitget uses everywhere else;
> "open and close mode" appears only here.
>
> **Doc defect:** this page has no `>orderSource` field, while the pending
> endpoint has one. The Trade group's history endpoint does have one. Inconsistent
> across the three history surfaces.
>
> **Note:** `executeOrderId` is the link from plan to the real order — the field
> `plan-sub-order` reports as its `orderId`. Use it to join a triggered plan to
> its fill via `/api/v2/mix/order/fills` (see `04_trade.md`).

## Vocabulary consistency

The same rules as the rest of the Classic Futures surface apply unchanged:
`productType` is UPPERCASE (`USDT-FUTURES`, `COIN-FUTURES`, `USDC-FUTURES`),
`symbol` is the bare pair with no `_UMCBL` suffix, and margin mode on the wire is
`isolated` or `crossed` — **not** `cross`. The `plan` group adds no exceptions
to any of these; it only contradicts them in several examples, as catalogued
above.

The dead V1 vocabulary — `timInForceValue`, the value `normal` — appears nowhere
in this group. Time-in-force on a triggered order is the same `orderType`
(`limit` / `market`) field as any other order; the plan group adds no TIF
parameter at all.

## Defect list (this group)

| # | Endpoint | Defect |
|---|---|---|
| 1 | Get Pending / Get History / Trigger Sub Order | Response `>planType` documented as only `normal_plan` or `track_plan`, but the same pages accept `planType=profit_loss` and therefore return Family B rows whose `planType` the schema declares impossible. **Unresolvable from the live page** |
| 2 | Cancel Trigger Order | The only page listing all six `planType` values, and it describes them differently from both placement endpoints ("batch profit order" vs "take profit plan", "trailing order" vs "trailing stop", "plan order" vs "trigger order") |
| 3 | Cancel Trigger Order | `>clientOid` description says "`triggerId` prevails" — no such field exists in the group |
| 4 | Get Pending Trigger Order | `index_price` offered as a `triggerType` / `stopSurplusTriggerType` / `stopLossTriggerType` value on this page alone; no placement endpoint accepts it and the history endpoint's identical fields omit it |
| 5 | Get History Trigger Order | Response example contains `priceAvg`, which is not in the parameter table |
| 6 | Get Pending Trigger Order | `symbol` listed twice in the request parameter table, identically |
| 7 | Get History Trigger Order | `baseVolume` and `callbackRatio` lack the `>` element prefix that every neighbouring field has |
| 8 | Get History Trigger Order | No `>orderSource` field, while the pending endpoint and the Trade history endpoint both have one |
| 9 | Get History Trigger Order | `>tradeSide` glossed "open and close mode" instead of `hedge-mode` |
| 10 | Place Trigger Order | `reduceOnly` table says lowercase `yes`/`no`; the example sends `"NO"`; the Trade group uses `YES`/`NO` |
| 11 | Place Trigger Order | Example sends `presetStopSurplusPrice` and `presetStopLossPrice`, which are not in this page's parameter table (Trade-group field names) |
| 12 | Place Trigger Order | `triggerType` marked Required: Yes here, Required: No on `place-tpsl-order` for the same purpose |
| 13 | Modify Trigger Order | Example sends `planType` and `symbol`; neither is in the parameter table |
| 14 | Modify TP/SL | `triggerType` description missing its closing parenthesis; `executePrice` description ends in a stray "implement." |
| 15 | Modify TP/SL | `marginCoin` lacks the capitalisation note that `place-tpsl-order` and `cancel-plan-order` both carry |
| 16 | Place TP/SL / Place Pos TP/SL / Modify TP/SL / Modify Trigger / Cancel Trigger | Example bodies lowercase `productType` and `symbol`, contradicting the tables and the V2 vocabulary |
| 17 | Get Pending / Get History | Response examples lowercase `symbol`, `marginCoin` and `enterPointSource` |
| 18 | Place TP/SL | `size` marked Required: Yes while the description makes it conditional on `planType` |
| 19 | Cancel Trigger Order | `failureList` has no `errorCode`, unlike every Trade failure list |
| 20 | Cancel Trigger Order | Example `errorMsg` reads `"notExistend"` (misspelled) |
| 21 | Whole group | `cancelled` (2 l's) in the plan group vs `canceled` (1 l) in the Trade group |
| 22 | Whole group | Trailing-stop callback field is `callbackRatio` in Family A but `rangeRate` in Family B |
| 23 | Place Pos TP/SL | `data` array element count and per-element meaning undocumented; example returns 2 elements for 1 requested leg |
| 24 | Whole group | Two `Speed limit is 10 times/s (UID)` / `Rate limit: 10 req/sec/UID` renderings for the same 10/s budget |

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/06_tp_sl.md`
