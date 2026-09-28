# Bitget Classic Futures — WebSocket (private channels)

Source: https://www.bitget.com/legacy-docs/classic/quickStart/websocket-intro
Crawled on: 2026-09-28

The private half of the Classic Futures WebSocket surface: 8 push channels, 2
`op:"trade"` request channels, the WS-vs-REST vocabulary mismatches, and the
group's doc defects. Connection, limits, heartbeat, login and the public
channels are in `07_websocket.md`.

> Cachy wires a subset; see `INTEGRATION_STATUS.md`.

## Private push channels

All eight require a successful `login` first and all live on
`wss://ws.bitget.com/v2/ws/private`. The only push-time documented for any of
them is `action: "snapshot"` on subscribe.

### `equity` — Equity Channel

- Rate limit: *not stated in the docs*
- Auth: `login` (signed)
- Page: `contract/websocket/private/Equity-Channel`

"Data will be pushed when the following events occurred: 1. Transfer balance to
Futures account 2. Trading voucher deposit 3. Open/close orders are filled".
Subscribes with `instType` and `channel` only — no selector key.

| Push field | Meaning |
|---|---|
| `usdtEquity` | Account equity (USDT) |
| `btcEquity` | Account equity (BTC) |
| `usdtUnrealized` | Unrealized profit and loss（USDT） — full-width brackets in source |
| `unionTotalMargin` | Total multi-asset margin |
| `unionAvailable` | Available balance under multi-asset margin mode |
| `unionMm` | Maintenance margin under multi-asset margin mode |

> **Note:** every field is hardcoded to a single coin (`usdt*`, `btcEquity`)
> even though `instType` includes `COIN-FUTURES`. There is no generic equity
> field and no `marginCoin` selector on this channel.

### `positions` — Position Channel

- Rate limit: *not stated in the docs*
- Auth: `login` (signed)
- Page: `contract/websocket/private/Positions-Channel`

Push triggers are copied verbatim from the Order Channel ("Open/Close orders
are created / filled, Orders are canceled") rather than describing position
changes — boilerplate, as printed.

| Push field | Meaning |
|---|---|
| `posId` | Position ID |
| `instId` | Product ID |
| `marginCoin` | Currency of occupied margin |
| `marginSize` | Occupied margin (amount) |
| `marginMode` | Margin mode |
| `holdSide` | Position direction |
| `posMode` | Position mode |
| `total` | Open position size |
| `available` | Size of positions that can be closed |
| `frozen` | Amount of frozen margin |
| `openPriceAvg` | Average entry price |
| `leverage` | Leverage (example shows the **number** `20`, unquoted) |
| `achievedProfits` | Realized PnL |
| `unrealizedPL` | Unrealized PnL |
| `unrealizedPLR` | Unrealized ROI |
| `liquidationPrice` | Estimated liquidation price |
| `keepMarginRate` | Maintenance margin rate |
| `isolatedMarginRate` | Actual margin ratio under isolated margin mode |
| `marginRate` | Occupancy rate of margin |
| `breakEvenPrice` | Position breakeven price |
| `totalFee` | Funding fee, accumulated; "The initial value is empty, indicating that no funding fee has been charged yet." |
| `deductedFee` | Deducted transaction fees during the position |
| `markPrice` | Mark Price |
| `cashDividend` | Cash dividend, unit: USDT |
| `assetMode` | Account Mode — `union` Union Margin, `single` Single Margin |
| `cTime` / `uTime` | Creation / last update, Unix ms |

> **⚠️ Defect: `autoMargin` is in the example but not in the table.** The
> example payload ends with `"autoMargin": "off"`, and the Push Parameters table
> has no `autoMargin` row. Undocumented field, present on the wire.
>
> **Defect (inverted):** `isolatedMarginRate` and `keepMarginRate` are in the
> table but **absent from the example** payload.
>
> **Defect:** `leverage` is declared `String` but the example shows the bare
> number `20`.
>
> **WS-vs-REST:** this channel's `frozen` corresponds to `locked` on the REST
> `single-position` response — see the [mismatch table](#ws-vs-rest-vocabulary-mismatches).
> And this channel's `assetMode` is spelled differently from the `account`
> channel's `assetsMode` — see the same table.

### `positions-history` — History Position Channel

- Rate limit: *not stated in the docs*
- Auth: `login` (signed)
- Page: `contract/websocket/private/History-Positions-Channel`

"Data will be pushed when the position totally closed" — the same sentence
appears twice on the page, once above the Description heading and once inside
it. Only fires on full close, not on partial reduction.

| Push field | Meaning |
|---|---|
| `posId` | Position ID |
| `instId` | Product ID |
| `marginCoin` | Currency of occupied margin |
| `marginMode` | Margin mode — see defect below |
| `holdSide` | Position direction |
| `posMode` | Position mode |
| `openPriceAvg` | Average entry price |
| `closePriceAvg` | Average close price |
| `openSize` / `closeSize` | Open / close size |
| `achievedProfits` | Realized PnL |
| `settleFee` | Settle fee |
| `openFee` / `closeFee` | Total open / close fee |
| `cTime` / `uTime` | Creation / last update, Unix ms |

> **⚠️ Defect: `marginMode` value space.** This is the **only page in the entire
> Classic Futures surface** that documents margin mode as:
>
> > `marginMode` — Margin mode — **`fixed`**: isolated mode / `crossed`: crossed
> > mode
>
> Every other page — REST `single-position`, `all-position`,
> `history-position`, `set-margin`, `query-position-lever`, and every WebSocket
> channel that documents the field at all — says **`isolated`** / `crossed`.
> `fixed` appears nowhere else. Treat `fixed` as a documentation error for the
> isolated value, but be aware a client keying off the value name will not
> match `isolated` from this channel.

### `account` — Account Channel

- Rate limit: *not stated in the docs*
- Auth: `login` (signed)
- Page: `contract/websocket/private/Account-Channel`

Same three push triggers as `equity` and `positions-history`'s page, verbatim:
transfer to Futures account, trading voucher deposit, open/close filled.

> **This is the one private channel keyed by `coin`, not `instId`.** Subscribe
> with `{"instType":"USDT-FUTURES","channel":"account","coin":"default"}`.

| Push field | Meaning |
|---|---|
| `marginCoin` | Margin coin |
| `frozen` | Locked quantity (margin coin) |
| `available` | Currently available assets |
| `maxOpenPosAvailable` | Maximum available balance to open positions |
| `maxTransferOut` | Maximum transferable amount |
| `equity` | Account assets |
| `usdtEquity` | Account equity in USD |
| `crossedRiskRate` | Risk ratio in cross margin mode |
| `unrealizedPL` | Unrealized PnL |
| `unionTotalMargin` | Margin Amount under Union Margin Mode |
| `unionAvailable` | Available Balance under Union Margin Mode |
| `unionMm` | Maintenance Margin under Union Margin Mode |
| `assetsMode` | Account Mode — `union` Unified Margin, `single` Single-Currency Margin |

> **WS-vs-REST:** `assetsMode` here vs `assetMode` on the `positions` channel
> and on REST `set-asset-mode` / `accounts`. Three spellings, two channels, one
> API. See the [mismatch table](#ws-vs-rest-vocabulary-mismatches).

### `orders` — Order Channel

- Rate limit: *not stated in the docs*
- Auth: `login` (signed)
- Page: `contract/websocket/private/Order-Channel`

"Data will be pushed when the following events occured: 1. Open/Close orders
are created 2. Open/Close orders are filled 3. Orders canceled" (the
"occured" typo is in the source). `instId` is `default` for all pairs; "For
settled Futures, it only supports `default`".

| Push field | Meaning |
|---|---|
| `orderId` | Order ID |
| `clientOid` | Customized order ID |
| `price` | Order price |
| `size` | Original order amount in coin |
| `posMode` | Position Mode — `one_way_mode`, `hedge-mode` |
| `enterPointSource` | Order source — `WEB`, `API`, `SYS`, `ANDROID`, `IOS` |
| `tradeSide` | Direction — wide system-action enumeration, see below |
| `notionalUsd` | Estimated USD value of orders |
| `orderType` | Order type — `limit`, `market` |
| `force` | Order validity period |
| `side` | Order direction |
| `posSide` | Position direction — `long`, `short`, `net` |
| `marginMode` | Margin mode — `crossed`, `isolated` |
| `marginCoin` | Margin coin |
| `fillPrice` | Latest filled price |
| `tradeId` | Latest transaction ID |
| `baseVolume` | Number of latest filled orders |
| `fillTime` | Latest transaction time, Unix ms |
| `fillFee` | Transaction fee of the latest transaction, **negative value** |
| `fillFeeCoin` | Currency of transaction fee of the latest transaction |
| `tradeScope` | The liquidity direction of the latest transaction — `T` taker, `M` maker |
| `accBaseVolume` | Total filled quantity |
| `fillNotionalUsd` | USD value of filled orders |
| `priceAvg` | Average filled price; `0` if filled size is 0 or not filled; "This field will not be pushed if the order is cancelled" |
| `status` | Order status — see mismatch table |
| `cancelReason` | `normal_cancel` Normal cancel / `stp_cancel` Cancelled by STP |
| `leverage` | Leverage |
| `feeDetail` | List\<Object\> of `feeCoin`, `fee` |
| `pnl` | Profit |
| `uTime` / `cTime` | Update / creation time, Unix ms |
| `reduceOnly` | Reduce-only — see mismatch table |
| `presetStopSurplusPrice` | Set TP price / Take-profit value — **listed twice** |
| `presetStopLossPrice` | Set SL price / Stop-loss value — **listed twice** |
| `presetStopSurplusExecutePrice` | Preset stop - profit execution price |
| `presetStopLossExecutePrice` | Preset stop-loss execution price |
| `stpMode` | STP Mode — `none`, `cancel_taker`, `cancel_maker`, `cancel_both` |
| `totalProfits` | Total profits |

`tradeSide` carries the same 23-value system-action enumeration as REST
`Get Order Detail` (`open`, `close`, `reduce_close_long`, `reduce_close_short`,
`burst_close_*`, `offset_close_*`, `delivery_close_*`, `dte_sys_adl_*`,
`*_single`, …). Note the trade-off again: on the WS channel it is a wide
read-side enumeration, not the `open`/`close` request-side pair.

> **Doc defect:** `presetStopSurplusPrice` and `presetStopLossPrice` are each
> listed **twice** in the Push Parameters table — once as "Set TP price" /
> "Set SL price" and again as "Take-profit value" / "Stop-loss value".
>
> **Doc defect:** `presetStopSurplusType` and `presetStopLossType` appear in the
> example payload (`"presetStopSurplusType": "fill_price"`) but are **not in the
> Push Parameters table** at all — the same class of omission as `autoMargin` on
> `positions`. They *are* documented on the REST order-detail response.
>
> **Doc defect:** `tradeScope` is documented as "`T` taker `M` maker" — capital
> letters here, lowercase `taker`/`maker` everywhere else in the API.
>
> **Doc defect:** the `> instId` description is a copy-paste of an unrelated
> field: "delivery contract reference：[https://www.bitget.com/legacy-docs/common/release-note]".
> The same text appears on the `orders-algo` channel.
>
> **Doc defect:** the table has **no `action` row**, yet the example payload
> carries `"action": "snapshot"`.
>
> **Note:** `fillFee` is documented as a "negative value" and the example
> confirms `-0.00000000`, whereas the `fee` channel's `totalFee` is also
> negative (`-0.183717`). Sign conventions are consistent between them.

### `orders-algo` — Trigger Order Channel

- Rate limit: *not stated in the docs*
- Auth: `login` (signed)
- Page: `contract/websocket/private/Plan-Order-Channel`

"Data will be pushed when the trigger plans are opened,cancelled,modified,triggered"
(no space after the comma in the source). This is the WebSocket counterpart of
the Trigger Order group in `06_tp_sl.md`.

| Push field | Meaning |
|---|---|
| `instId` | Product ID |
| `orderId` | "Bot order ID" |
| `clientOid` | "Customized bot order ID" |
| `triggerPrice` | Trigger price |
| `triggerType` | `fill_price` filled price / `mark_price` mark price |
| `triggerTime` | Trigger time, ms |
| `planType` | **short codes** — see mismatch table |
| `price` | Order price |
| `executePrice` | Execute price |
| `size` | Original order amount in coin |
| `actualSize` | Actual number of orders in coin |
| `orderType` | `limit` limit order / `market` |
| `side` | Order direction |
| `tradeSide` | Trade Side trading direction |
| `posSide` | Position direction |
| `marginCoin` | Margin coin |
| `status` | `live` plan order created / `executed` executed / `fail_execute` execute failed / `cancelled` cancelled / `executing` executing |
| `posMode` | `one_way_mode` / `hedge_mode` |
| `enterPointSource` | Order source — `WEB`, `API`, `SYS`, `ANDROID`, `IOS` |
| `stopSurplusPrice` | Preset/Partial/Position take-profit **execution** price |
| `stopSurplusTriggerPrice` | Preset/Partial/Position take-profit **trigger** price |
| `stopSurplusTriggerType` | Preset/Partial/Position take-profit trigger type |
| `stopLossPrice` | Preset/Partial/Position stop-loss **execution** price |
| `stopLossTriggerPrice` | Preset/Partial/Position stop-loss **trigger** price |
| `stopLossTriggerType` | Preset/Partial/Position stop-loss trigger type |
| `stpMode` | STP Mode — `none`, `cancel_taker`, `cancel_maker`, `cancel_both` |
| `uTime` | Order update time, Unix ms |

The three `stop*` fields each carry a per-`planType` meaning, quoted in the
page: `stopSurplusPrice` — "1. When planType is pl, it represents the preset
take-profit execution price. 2. When planType is tp, it represents the partial
take-profit execution price. 3. When planType is ptp, it represents the position
take-profit execution price."

> **Doc defect:** `cTime` is in the example payload but **not** in the Push
> Parameters table, while `uTime` is.
>
> **Doc defect:** `orderId` and `clientOid` are described as "**Bot** order ID"
> and "Customized **bot** order ID". The word "bot" appears nowhere else in the
> channel, and the ids are ordinary order ids.
>
> **Doc defect:** the `> instId` field inside `data` carries the same
> meaningless "delivery contract reference：" text as the `orders` channel.
>
> **Note:** this channel's `status` includes **`executing`**, which does not
> appear in any REST plan status set. REST `orders-plan-pending` documents only
> `live`; `orders-plan-history` documents `executed` / `fail_execute` /
> `cancelled`; `plan-sub-order` documents `success` / `fail` / `cancelled` /
> `in_progress` / `in_progress_tracking`. **Five different status sets across
> five surfaces describing the same underlying plan.**

### `fill` — Fill Channel

- Rate limit: *not stated in the docs*
- Auth: `login` (signed)
- Page: `contract/websocket/private/Fill-Channel`

"Data will be pushed when order filled." — stated twice on the page, once above
and once inside the Description heading.

| Push field | Meaning |
|---|---|
| `orderId` | Order ID |
| `clientOid` | Customize order ID |
| `tradeId` | Trade ID |
| `symbol` | Symbol Name — **note: `symbol`, not `instId`** |
| `side` | Trade direction — see note below |
| `orderType` | `limit` / `market` |
| `posMode` | Hold Mode — `one_way_mode`, `hedge_mode` |
| `price` | Order price |
| `baseVolume` | Amount of base coin |
| `quoteVolume` | Amount of denomination coin |
| `profit` | Realized PnL |
| `tradeSide` | Same 23-value system-action enumeration |
| `tradeScope` | The liquidity direction — `taker`, `maker` |
| `feeDetail` | List of `deduction` (`yes`/`no`), `totalDeductionFee`, `totalFee`, `feeCoin` |
| `cTime` / `uTime` | Create / Update Time, Unix ms |

> **Important — the hedge-mode `side` rule, stated on this page verbatim:**
>
> > Please note, for this channel, in hedge position mode, **Open Long** and
> > **Close Short**, the "side" will be `buy`; **Close Long** and **Open Short**,
> > the "side" will be `sell`
>
> This is the same hedge-mode semantics as `04_trade.md` — `side` is position
> direction, not transaction direction — but stated from the *fill* side rather
> than the order side, and it pairs **Close Short** with `buy`, which reads
> backwards to anyone used to the order-side table until they notice both are
> position direction. The `side` on a `fill` therefore cannot be read as "this
> transaction was a buy".

> **Note:** the subscription selector is `instId` but the push payload field is
> `symbol` — the only private channel where the two differ.

### `adl-noti` — ADL Notification Channel

- Rate limit: *not stated in the docs*
- Auth: `login` (signed)
- Page: `contract/websocket/private/ADL-Notification-Channel`

The one channel that documents both `action` values explicitly: "`snapshot`
Full data / `update` Incremental data".

| Push field | Meaning |
|---|---|
| `symbol` | Symbol name |
| `side` | Position side — `buy` Buy / `sell` Sell |
| `status` | ADL status — `triggered` Triggered |
| `price` | ADL execution price |
| `amount` | ADL execution amount, **Unit: quote coin** |
| `ts` | ADL start time (Unix millisecond timestamp) |

> **Note:** `status` is documented with exactly one value, `triggered`. Whether
> other ADL states exist is not documented.
>
> **Note:** the example payload uses `"action": "update"` with a non-`snapshot`
> first frame, which is the only incremental example in the private set.

## Request channels (`op:"trade"`)

These two are **requests, not pushes**. They are the only way to submit or
cancel an order over WebSocket, and they are the only two frames on the entire
surface that use `op:"trade"` instead of `op:"subscribe"`. Each carries a
`params` object and a caller-supplied `id` used to correlate the response.

Both request channels support an optional top-level `apiCode` — "API rebate
identifier" — matching the `X-CHANNEL-API-CODE` header on the REST Trade
endpoints (`04_trade.md`).

### `place-order`

- Rate limit: *not stated in the docs*
- Auth: `login` (signed)
- Page: `contract/websocket/private/Place-Order-Channel`

```json
{ "args":[ { "channel":"place-order",
             "id":"xxxxx-xxx-xxx-xxxx-xxxxxx",
             "instId":"BTCUSDT",
             "instType":"USDT-FUTURES",
             "params":{ "orderType":"limit", "side":"buy", "size":"2",
                        "tradeSide":"open", "price":"501", "marginCoin":"USDT",
                        "force":"gtc", "marginMode":"crossed",
                        "clientOid":"xxxxx-xxx-xxx-xxxx-xxxxxx" } } ],
  "op":"trade" }
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `op` | String | Yes | `trade` |
| `apiCode` | String | No | API rebate identifier |
| `args` | List\<Object\> | Yes | List of channels to request subscription |
| `> id` | String | Yes | Unique Identifier. Length <= 40. (`"^\[0-9A-Za-z\_:#\\\-+\\s\]\*$"`) |
| `> instType` | String | Yes | Product line type `USDT-FUTURES` |
| `> instId` | String | Yes | Product ID, e.g. `ETHUSDT` |
| `> channel` | String | Yes | Channel name, `place-order` |
| `> params` | Object | Yes | — |
| `>> orderType` | String | Yes | `limit` Limit order / `market` Market order |
| `>> side` | String | Yes | `buy`: Buy(one-way-mode); Long position direction(hedge-mode) / `sell`: Sell(one-way-mode); Short position direction(hedge-mode) |
| `>> size` | String | Yes | Amount (base coin). To get the decimal places of size: Get Contract Config |
| `>> force` | String | Yes | Execution strategy — "It will be invalid when orderType is market". `gtc` Normal limit order, good till cancelled / `post_only` Post only / `fok` Fill or kill / `ioc` Immediate or cancel |
| `>> price` | String | No | Limit price. "The decimal places of price and the price step can be returned by the Get Symbol Info interface" |
| `>> clientOid` | String | No | Custom order ID |
| `>> marginCoin` | String | Yes | Margin coin(capitalized) |
| `>> marginMode` | String | Yes | `isolated`: isolated margin / `crossed`: crossed margin |
| `>> tradeSide` | String | No | Trade type. "Only required in hedge-mode". `open`: Open position / `close`: Close position |
| `>> reduceOnly` | String | No | "Whether or not to just reduce the position: `YES, NO` Default: `NO`. Applicable only in one-way-position mode" |
| `>> presetStopSurplusPrice` | String | No | Take-profit value. No take-profit is set if the field is empty. |
| `>> presetStopLossPrice` | String | No | Stop-loss value. No stop-loss is set if the field is empty. |
| `>> stpMode` | String | No | STP Mode(Self Trade Prevention) — `none` not setting STP(default) / `cancel_taker` / `cancel_maker` / `cancel_both` |

The `params` schema is a **strict subset of the REST `place-order` body** — same
field names, same value spaces, including the uppercase `YES`/`NO` on
`reduceOnly`. It omits `presetStopSurplusExecutePrice` and
`presetStopLossExecutePrice`, which REST accepts.

Response:

```json
{ "event":"trade",
  "arg":[ { "id":"xxxxx-xxx-xxx-xxxx-xxxxxx", "instType":"USDT-FUTURES",
            "channel":"place-order", "instId":"BTCUSDT",
            "params":{ "orderId":"xxxxxxxxxxx",
                       "clientOid":"xxxxx-xxx-xxx-xxxx-xxxxxx" } } ],
  "code":0, "msg":"Success" }
```

| Return field | Type | Description |
|---|---|---|
| `event` | String | Event — `trade` / `error` |
| `arg` | Object | Channel — `id`, `instType`, `instId`, `channel`, `params` |
| `code` | String | code |
| `msg` | String | msg |

> **⚠️ Doc defect: the success example is labelled "Fail".** The heading
> immediately above this payload reads `Fail`, while the payload itself carries
> `"code":0, "msg":"Success"`. There is no example of an actual failure on this
> page. Identical defect on the `cancel-order` page.
>
> **⚠️ Doc defect: `arg` changes type between request and response.** In the
> request `arg`/`args` is a **list of objects**; in this response `arg` is
> documented as `Object` while the payload shows an **array**. The type column
> says `Object`, the wire says array. Same on `cancel-order`.
>
> **Note:** `"code":0` is the **number** zero, not the string `"00000"`. See the
> [login-code contradiction](#%E2%9A%A0-unresolved-the-login-success-code).

> ### ⚠️ Not fully disambiguated: the `id` character class
>
> The page prints the allowed-character pattern as
> `("^\[0-9A-Za-z\_:#\\\-+\\s\]\*$")` — double-backslash-escaped markdown. Read
> literally that is `^[0-9A-Za-z_:#\-+ \s]*$` (a trailing whitespace class); a
> literal-space form `^[0-9A-Za-z_:#\-+ ]*$` is equally consistent with what the
> rendered page shows. The two differ on whether a space or any whitespace
> character is accepted. **This could not be resolved from the rendered page**;
> the pattern above is transcribed exactly as printed. The only unambiguous
> constraint the page states is `Length <= 40`.

### `cancel-order`

- Rate limit: *not stated in the docs*
- Auth: `login` (signed)
- Page: `contract/websocket/private/Cancel-Order-Channel`

```json
{ "args":[ { "channel":"cancel-order",
             "id":"xxxxx-xxx-xxx-xxxx-xxxxxx",
             "instId":"BTCUSDT",
             "instType":"USDT-FUTURES",
             "params":{ "orderId":"xxxxxxxxxx",
                        "clientOid":"xxxxx-xxx-xxx-xxxx-xxxxxx" } } ],
  "op":"trade" }
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `op` | String | Yes | `trade` |
| `args` | List\<Object\> | Yes | List of channels to request subscription |
| `> id` | String | Yes | Unique Identifier. Length <= 40. (`"^\[0-9A-Za-z\_:#\\\-+\\s\]\*$"`) |
| `> instType` | String | Yes | Product line type `USDT-FUTURES` |
| `> instId` | String | Yes | Product ID, e.g. `ETHUSDT` |
| `> channel` | String | Yes | Channel name, `cancel-order` |
| `> params` | Object | Yes | — |
| `>> orderId` | String | No | Order ID. "Either `orderId` or `clientOid` is required. If both are present, orderId prevails." |
| `>> clientOid` | String | No | Custom order ID. "Either `orderId` or `clientOid` is required. If both are present, orderId prevails." |

The response shape is identical to `place-order`'s, with `channel: "cancel-order"`
and the same `"code":0, "msg":"Success"` under the same mislabelled `Fail`
heading. No `apiCode` parameter is documented on this page (it is on
`place-order`).

> **Note:** unlike `place-order`, this channel has **no** `apiCode` row and its
> `args` description still says "List of channels to request subscription",
> which is copy-paste from the subscribe pages — these are not subscriptions.

## WS-vs-REST vocabulary mismatches

The WebSocket surface does **not** reuse the REST vocabulary. A port that
assumes the two are interchangeable will silently mis-read live data. The three
mismatches below are the ones that change the meaning of a value, not just its
spelling.

### 1. `planType` — a completely different value space

REST (Trigger Order group, `06_tp_sl.md`) uses seven descriptive identifiers.
WebSocket (`orders-algo`) uses seven short codes. **There is no string overlap
between the two sets.**

| REST `planType` | WS `planType` | Meaning |
|---|---|---|
| `normal_plan` | `pl` | Trigger order / preset TP-SL on an order |
| `track_plan` | `track` | Trailing stop |
| `profit_plan` | `tp` | Partial take profit |
| `loss_plan` | `sl` | Partial stop loss |
| `pos_profit` | `ptp` | Position take profit |
| `pos_loss` | `psl` | Position stop loss |
| `moving_plan` | `mtpsl` | Trailing TP/SL |
| `profit_loss` (REST query-only aggregate) | *no equivalent* | WS has no aggregate selector |

Verbatim from the WS page: "Websocket trigger order type. Data will be pushed
when modify,cancel,open,triggered the plan types below — `pl`:Default value,
trigger order / `tp`:Partial take profit / `sl`:Partial stop loss / `ptp`:
Position take profit / `psl`:Position stop loss / `track`:Trailing stop /
`mtpsl`:Trailing TP/SL".

Note also that WS `moving_plan` is renamed twice: the REST `moving_plan` ("trailing
stop") is WS `track`, while WS `mtpsl` is a *different* thing ("Trailing TP/SL")
that has no single REST counterpart — REST's nearest is a `moving_plan` order
carrying `stopSurplusTriggerPrice`/`stopLossTriggerPrice`. A one-to-one map is
not available.

### 2. Order status — `status` vs `state`

| Surface | Field | Values |
|---|---|---|
| WS `orders` channel | **`status`** | `live`, `partially_filled`, `filled`, `canceled` |
| REST `GET /api/v2/mix/order/detail` | **`state`** | `live`, `partially_filled`, `filled`, `canceled` |

Same four values, **different field name**. REST `orders-pending` and
`orders-history` use `status` again, so REST itself is inconsistent — only
`order/detail` says `state`.

### 3. `reduceOnly` — lowercase vs uppercase

| Surface | Field | Values |
|---|---|---|
| WS `orders` channel | `reduceOnly` | **`yes`**, **`no`** (lowercase) |
| WS `place-order` request | `reduceOnly` | `YES`, `NO` (uppercase) |
| REST `order/detail`, `place-order` | `reduceOnly` | `YES`, `NO` (uppercase) |
| REST `plan/place-plan-order` | `reduceOnly` | `yes`, `no` (lowercase) |

**The case flips within the WebSocket surface itself**: the `orders` push channel
emits lowercase, the `place-order` request channel accepts uppercase. And REST is
split too — the Trade group is uppercase, the Trigger group is lowercase. See
also the `deduction` field on WS `fill` (`yes`/`no`) versus REST
`feeDetail.deduction`, which is documented without a value set.

### Additional field-level divergences

| # | Concept | WebSocket | REST | Note |
|---|---|---|---|---|
| 4 | Frozen amount | `positions.frozen`, `account.frozen` | `single-position.locked` | Same quantity, two names |
| 5 | Account mode | `account.assetsMode` **and** `positions.assetMode` | `assetMode` | Three spellings, two of them on WS |
| 6 | Margin mode | `positions-history.marginMode` = **`fixed`**/`crossed` | `isolated`/`crossed` | `fixed` appears on no other page |
| 7 | Symbol in payload | `fill.symbol`, `adl-noti.symbol` | `symbol` | Arg is `instId`, data field is `symbol` |
| 8 | TP/SL execution price on plans | `orders-algo.stopSurplusPrice` | `stopSurplusExecutePrice` | `Price` vs `ExecutePrice` |
| 9 | Trade scope | `orders.tradeScope` = `T`/`M` | `tradeScope` = `taker`/`maker` | Capitalisation |
| 10 | Liquidity flag | `orders.tradeSide` = `open`/`close` + 21 more | same on `order/detail` | Read-side only; do not round-trip |
| 11 | Plan status | `orders-algo.status` = `live`/`executed`/`fail_execute`/`cancelled`/**`executing`** | `orders-plan-pending` = `live`; `orders-plan-history` = `executed`/`fail_execute`/`cancelled`; `plan-sub-order` = `success`/`fail`/`cancelled`/`in_progress`/`in_progress_tracking` | Five sets, five surfaces |
| 12 | Success code | `login` → `"0"`; trade requests → `0` (number) | `"00000"` | Three renderings |

## Defect list (this group)

| # | Where | Defect |
|---|---|---|
| 1 | Login | **Timestamp unit contradicts itself** — prose and JS say milliseconds, Java sample and the wire example say seconds. Left unresolved |
| 2 | Login | **Success code contradicts the rest of the API** — `{"code":"0"}` where REST uses `"00000"`, and the trade channels use the number `0` |
| 3 | Depth Channel | Prose says `book1`/`book5`/`book15` (singular) while the channel table, request example, response example and frequency sentence all use `books1`/`books5`/`books15` (plural) |
| 4 | Depth Channel | `pseq` declared `String`, shown unquoted; `seq` declared `Long`, shown unquoted — two declarations, one payload |
| 5 | Depth Channel | Two distinct `ts` fields (match-engine vs streaming) both declared `String`, both unquoted; no statement of which orders the stream |
| 6 | History Position Channel | `marginMode` documented as `fixed`/`crossed`; every other page in the API says `isolated`/`crossed` |
| 7 | Account Channel | `assetsMode` here vs `assetMode` on the positions channel and on REST — three spellings of one flag |
| 8 | Positions Channel | `autoMargin` present in the example payload, absent from the Push Parameters table |
| 9 | Positions Channel | `isolatedMarginRate` and `keepMarginRate` in the table, absent from the example payload |
| 10 | Positions Channel | `leverage` declared `String`, shown as the bare number `20` |
| 11 | Order Channel | `presetStopSurplusType` / `presetStopLossType` in the example, absent from the table |
| 12 | Order Channel | `presetStopSurplusPrice` and `presetStopLossPrice` each listed twice with different descriptions |
| 13 | Order Channel | No `action` row in the Push Parameters table, but the example carries `"action": "snapshot"` |
| 14 | Order Channel | `> instId` description is an unrelated copy-paste ("delivery contract reference：") |
| 15 | Order Channel | `tradeScope` documented as `T`/`M`, lowercase `taker`/`maker` everywhere else |
| 16 | Trigger Order Channel | `cTime` in the example payload, absent from the Push Parameters table |
| 17 | Trigger Order Channel | `orderId` / `clientOid` described as "Bot order ID" / "Customized bot order ID" with no mention of bots anywhere else |
| 18 | Trigger Order Channel | `> instId` inside `data` carries the same unrelated "delivery contract reference：" text |
| 19 | Candlestick Channel | No `action` row in the Push Parameters table, but the example carries `"action": "snapshot"` |
| 20 | Candlestick Channel | Volume indices `[5]`/`[6]`/`[7]` have overlapping, partly circular descriptions; the mapping to REST `baseVolume`/`quoteVolume` is not stated |
| 21 | Candlestick Channel | Granularity list is not in ascending duration (`candle1D`/`candle1W` precede `candle6H`/`candle3D`/`candle1M`) |
| 22 | Candlestick Channel | No UTC variants for 1m/5m/15m/30m/1H/4H; UTC series start at 6H |
| 23 | Subscribe | Example uses `"instType":"SPOT"` on a Futures-only page, in both request and acknowledgement |
| 24 | Subscribe | `> instType` return description reads "Instrument Type **MC**：Perpetual contract public channel" — Spot boilerplate |
| 25 | Subscribe / Unsubscribe | `event` described as "Event, subscribe **error**" / "Event, unsubscribe **error**" on the success acknowledgements |
| 26 | Unsubscribe | The "Example Response" is the request shape — has `op` and no `event` field |
| 27 | Unsubscribe | `instType` and `instId` marked Required: Yes, while the subscribe table marks both Required: No |
| 28 | Place Order / Cancel Order | The **success** example sits under a heading reading `Fail`; no real failure example is given on either page |
| 29 | Place Order / Cancel Order | `arg` typed `Object` in the response table but serialised as an array |
| 30 | Place Order / Cancel Order | `id` pattern printed double-backslash-escaped; literal-space vs `\s` reading unresolvable from the page |
| 31 | Cancel Order | No `apiCode` row, though `place-order` has one |
| 32 | Cancel Order | `args` described as "List of channels to request subscription" — it is not a subscription |
| 33 | Account Channel | The only private channel keyed by `coin` instead of `instId`; `equity` sends no selector at all |
| 34 | Equity Channel | All fields hardcoded to `usdt*`/`btcEquity` despite `instType` offering `COIN-FUTURES`; no `marginCoin` selector |
| 35 | Position / History Position Channels | "Data will be pushed when the position totally closed" stated twice, once above the Description heading |
| 36 | Positions Channel | Push-trigger list is copy-pasted from the Order Channel and does not describe position events |
| 37 | ADL Channel | `status` documented with the single value `triggered`; no other states described |
| 38 | Fill / History Position Channels | The push-trigger sentence is duplicated above and inside the Description heading |
| 39 | Fill Channel | Subscription selector is `instId` but the push field is `symbol` — the only private channel where they differ |
| 40 | Whole group | **No channel page prints a rate limit**; the intro page's connection/subscription limits are the only published figures, and they conflict (hard cap 1000 channels vs a 50-channel recommendation) |

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/07_websocket_private.md`
