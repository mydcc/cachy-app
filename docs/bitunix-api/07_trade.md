# Trade Endpoints

All endpoints are **private** interfaces and require a signature (see `01_sign.md`).

> ⚠️ **Important**: For interfaces that modify, create or delete orders
> the following applies: A successful interface response does not necessarily
> mean that the operation succeeded. Use the WebSocket push message as
> reliable confirmation.

---

## Batch Order

Source: https://www.bitunix.com/api-docs/futures/trade/batch_order.html

**Rate Limit**: 1 req/sec/uid

### Description
Places several orders in one request (max. 5).

### HTTP Request
`POST /api/v1/futures/trade/batch_order`

### Request Parameters
| Parameter       | Type    | Required | Description |
|-----------------|---------|----------|-------------|
| symbol          | string  | true     | Trading Pair |
| orderList       | list    | true     | Order list, max. length: 5 |
| > qty           | string  | true     | Quantity (base coin) |
| > price         | string  | false    | Order price. Required for order type `LIMIT` |
| > side          | string  | true     | Order side: `BUY` / `SELL` |
| > tradeSide     | string  | true     | Only required in hedge mode. `OPEN`/`CLOSE`. Open Long: side=`BUY`, tradeSide=`OPEN`. Open Short: side=`SELL`, tradeSide=`OPEN`. Close Long: side=`BUY`, tradeSide=`CLOSE`. Close Short: side=`SELL`, tradeSide=`CLOSE` |
| > positionId    | string  | false    | Position ID. Required if `tradeSide` = `CLOSE` |
| > orderType     | string  | true     | Order type: `LIMIT` / `MARKET` |
| > effect        | string  | false    | Time in force, required for `orderType=LIMIT`: `IOC` (Immediate or Cancel), `FOK` (Fill or Kill), `GTC` (Good till Canceled, Default), `POST_ONLY` |
| > clientId      | string  | false    | Custom order ID |
| > reduceOnly    | boolean | false    | Position reduction only |
| > tpPrice       | string  | false    | Take-profit trigger price |
| > tpStopType    | string  | false    | Take-profit trigger type: `MARK_PRICE` / `LAST_PRICE` |
| > tpOrderType   | string  | false    | Take-profit order type: `LIMIT` / `MARKET` |
| > tpOrderPrice  | string  | false    | Take-profit order price (required for `tpOrderType=LIMIT`) |
| > slPrice       | string  | false    | Stop-loss trigger price |
| > slStopType    | string  | false    | Stop-loss trigger type: `MARK_PRICE` / `LAST_PRICE` |
| > slOrderType   | string  | false    | Stop-loss order type: `LIMIT` / `MARKET` |
| > slOrderPrice  | string  | false    | Stop-loss order price (required for `slOrderType=LIMIT`) |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/trade/batch_order' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"symbol":"BTCUSDT","orderList":[{"side":"BUY","price":"60000","qty":"0.5","orderType":"LIMIT","reduceOnly":false,"effect":"GTC","clientId":"c12345","tpPrice":"61000","tpStopType":"MARK_PRICE","tpOrderType":"LIMIT","tpOrderPrice":"61000.1","slPrice":"59000","slStopType":"LAST_PRICE","slOrderType":"MARKET"},{"side":"SELL","price":"61000","qty":"0.5","orderType":"LIMIT","reduceOnly":false,"effect":"IOC","clientId":"c12346"}]}'
```

### Response Parameters
| Parameter     | Type   | Description |
|---------------|--------|-------------|
| successList   | list   | List of successful orders |
| > id          | string | Order ID |
| > clientId    | string | Client ID |
| failureList   | list   | List of failed orders |
| > clientId    | string | Client ID |
| > errorMsg    | string | Error message |
| > errorCode   | string | Error code |

### Response Example
```json
{"code":0,"data":{"orderId":"11111","clientId":"22222"},"msg":"Success"}
```

> `clientId` is capped at 64 chars (Cachy mints one per attempt). No `batch_order` verb, no plan-order verbs, and no `subAccountId`/`queryCanceled`/`includeSubAccounts` are surfaced in `TradingPort` — see `INTEGRATION_STATUS.md` and the adapter verb table in `unsupportedVerbs.test.ts` for what Cachy wires.

---

## Cancel All Orders

Source: https://www.bitunix.com/api-docs/futures/trade/cancel_all_orders.html

**Rate Limit**: 10 req/sec/uid

### Description
Cancels all orders.

### HTTP Request
`POST /api/v1/futures/trade/cancel_all_orders`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | false    | Trading Pair |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/trade/cancel_all_orders' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"symbol":"BTCUSDT"}'
```

### Response Parameters
| Parameter     | Type   | Description |
|---------------|--------|-------------|
| successList   | list   | List of successful orders |
| > id          | string | Order ID |
| > clientId    | string | Client ID |
| failureList   | list   | List of failed orders |
| > id          | string | Order ID |
| > clientId    | string | Client ID |
| > errorMsg    | string | Error message |
| > errorCode   | string | Error code |

### Response Example
```json
{"code":0,"data":{"successList":[{"orderId":"11111","clientId":"22222"}],"failureList":[{"orderId":"11112","clientId":"22223","errorMsg":"Order status error","errorCode":10013}]},"msg":"Success"}
```

---

## Cancel Orders

Source: https://www.bitunix.com/api-docs/futures/trade/cancel_orders.html

**Rate Limit**: 5 req/sec/uid

### Description
Cancels specific orders.

### HTTP Request
`POST /api/v1/futures/trade/cancel_orders`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | true     | Trading Pair |
| orderList | list   | true     | List of order parameters |
| orderId   | string | false    | Order ID. `orderId` or `clientId` required. If both are given, `orderId` takes precedence |
| clientId  | string | false    | Custom order ID. `orderId` or `clientId` required. If both are given, `orderId` takes precedence |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/trade/cancel_orders' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"symbol":"BTCUSDT","orderList":[{"orderId":"11111"},{"clientId":"22223"}]}'
```

### Response Parameters
| Parameter     | Type   | Description |
|---------------|--------|-------------|
| successList   | list   | List of successful orders |
| > id          | string | Order ID |
| > clientId    | string | Client ID |
| failureList   | list   | List of failed orders |
| > id          | string | Order ID |
| > clientId    | string | Client ID |
| > errorMsg    | string | Error message |
| > errorCode   | string | Error code |

### Response Example
```json
{"code":0,"data":{"successList":[{"orderId":"11111","clientId":"22222"}],"failureList":[{"orderId":"11112","clientId":"22223","errorMsg":"Order status error","errorCode":10013}]},"msg":"Success"}
```

---

## Close All Position

Source: https://www.bitunix.com/api-docs/futures/trade/close_all_position.html

**Rate Limit**: 1 req/sec/uid

### Description
Closes all positions.

### HTTP Request
`POST /api/v1/futures/trade/close_all_position`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | false    | Trading Pair |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/trade/close_all_position' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"symbol":"BTCUSDT"}'
```

### Response Parameters
None.

### Response Example
```json
{"code":0,"data":"","msg":"Success"}
```

---

## Flash Close Position

Source: https://www.bitunix.com/api-docs/futures/trade/flash_close_position.html

**Rate Limit**: 5 req/sec/uid

### Description
Closes a position by position ID (market order).

### HTTP Request
`POST /api/v1/futures/trade/flash_close_position`

### Request Parameters
| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| positionId | String | true     | Position ID |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/trade/flash_close_position' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"positionId":"19848247723672"}'
```

### Response Parameters
| Parameter  | Type   | Description |
|------------|--------|-------------|
| positionId | string | Position ID |

### Response Example
```json
{"code":0,"data":{"positionId":"19848247723672"},"msg":"Success"}
```

---

## Get History Orders

Source: https://www.bitunix.com/api-docs/futures/trade/get_history_orders.html

**Rate Limit**: 10 req/sec/uid

### Description
Retrieves historical orders, sorted by creation time in descending order.

### HTTP Request
`GET /api/v1/futures/trade/get_history_orders`

### Request Parameters
| Parameter       | Type    | Required | Description |
|-----------------|---------|----------|-------------|
| symbol          | string  | false    | Trading Pair |
| orderId         | string  | false    | Order ID |
| clientId        | string  | false    | Client ID |
| status          | string  | false    | Order status: `FILLED`, `CANCELED`, `PART_FILLED_CANCELED`, `EXPIRED` |
| type            | string  | false    | Order type: `LIMIT`, `MARKET`, default all |
| startTime       | int64   | false    | Start timestamp, Unix ms, e.g. 1597026383085 |
| endTime         | int64   | false    | End timestamp, Unix ms, e.g. 1597026683085 |
| skip            | int64   | false    | Number of skipped orders, Default: 0 |
| limit           | int64   | false    | Max. queries: 100, Default: 10 |
| subAccountId    | int64   | false    | With `subAccountId`: only historical orders of this sub-account. Without: orders of the main account |
| queryCanceled   | boolean | false    | Whether only cancelled orders are queried. Default: `false`. `true`: only cancelled orders (max. 3 days back); `false`: excluding cancelled orders (max. 90 days back) |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/trade/get_history_orders?symbol=BTCUSDT' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json"
```

### Response Parameters
| Parameter        | Type    | Description |
|-------------------|---------|-------------|
| orderList         | list    | Order list |
| > orderId         | string  | Order ID |
| > symbol          | string  | Trading Pair |
| > qty             | string  | Quantity (base coin) |
| > tradeQty        | string  | Filled quantity (base coin) |
| > positionMode    | string  | `ONE_WAY` or `HEDGE` |
| > marginMode      | string  | `ISOLATION` or `CROSS` |
| > leverage        | int     | Leverage |
| > price           | string  | Order price (required for `LIMIT`) |
| > side            | string  | `BUY` / `SELL` |
| > orderType       | string  | `LIMIT` / `MARKET` |
| > effect          | string  | Time in force: `IOC`, `FOK`, `GTC` (Default), `POST_ONLY` |
| > clientId        | string  | Custom order ID |
| > reduceOnly      | boolean | Position reduction only |
| > status          | string  | `INIT`, `NEW`, `PART_FILLED`, `CANCELED`, `FILLED` |
| > fee             | string  | Fee |
| > realizedPNL     | string  | Realized PnL |
| > tpPrice         | string  | Take-profit trigger price |
| > tpStopType      | string  | Take-profit trigger type: `MARK_PRICE` / `LAST_PRICE` |
| > tpOrderType     | string  | Take-profit order type: `LIMIT` / `MARKET` |
| > tpOrderPrice    | string  | Take-profit order price (required for `LIMIT`) |
| > slPrice         | string  | Stop-loss trigger price |
| > slStopType      | string  | Stop-loss trigger type: `MARK_PRICE` / `LAST_PRICE` |
| > slOrderType     | string  | Stop-loss order type: `LIMIT` / `MARKET` |
| > slOrderPrice    | string  | Stop-loss order price (required for `LIMIT`) |
| > ctime           | int64   | Creation timestamp |
| > mtime           | int64   | Last modification timestamp |
| > subAccountId    | int64   | Order account ID |
| total             | int64   | Total count |

### Response Example
```json
{"code":0,"data":{"orderList":[{"orderId":"11111","qty":"1","tradeQty":"0.5","price":"60000","symbol":"BTCUSDT","positionMode":"HEDGE","marginMode":"ISOLATION","leverage":15,"status":"CANCELED","fee":"0.01","realizedPNL":"1.78","type":"LIMIT","effect":"GTC","reduceOnly":false,"clientId":"22222","tpPrice":"61000","tpStopType":"MARK_PRICE","tpOrderType":"LIMIT","tpOrderPrice":"61000.1","slPrice":"59000","slStopType":"MARK_PRICE","slOrderType":"LIMIT","slOrderPrice":"59000.1","source":"api","ctime":1597026383085,"mtime":1597026383085}],"total":10},"msg":"Success"}
```

---

## Get History Trades

Source: https://www.bitunix.com/api-docs/futures/trade/get_history_trades.html

**Rate Limit**: 10 req/sec/uid

### Description
Retrieves historical trades, sorted by creation time in descending order.

### HTTP Request
`GET /api/v1/futures/trade/get_history_trades`

### Request Parameters
| Parameter   | Type   | Required | Description |
|-------------|--------|----------|-------------|
| symbol      | string | false    | Trading Pair |
| orderId     | string | false    | Order ID |
| positionId  | string | false    | Position ID |
| startTime   | int64  | false    | Start timestamp, Unix ms, e.g. 1597026383085 |
| endTime     | int64  | false    | End timestamp, Unix ms, e.g. 1597026683085 |
| skip        | int64  | false    | Number of skipped orders, Default: 0 |
| limit       | int64  | false    | Max. queries: 100, Default: 10 |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/trade/get_history_trades?symbol=BTCUSDT' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json"
```

### Response Parameters
| Parameter        | Type    | Description |
|-------------------|---------|-------------|
| tradeList         | list    | Trade list |
| > tradeId         | string  | Trade ID |
| > orderId         | string  | Order ID |
| > symbol          | string  | Trading Pair |
| > qty             | string  | Quantity (base coin) |
| > positionMode    | string  | `ONE_WAY` or `HEDGE` |
| > marginMode      | string  | `ISOLATION` or `CROSS` |
| > leverage        | int     | Leverage |
| > price           | string  | Order price (required for `LIMIT`) |
| > side            | string  | `BUY` / `SELL` |
| > orderType       | string  | `LIMIT` / `MARKET` |
| > effect          | string  | Time in force: `IOC`, `FOK`, `GTC` (Default), `POST_ONLY` |
| > clientId        | string  | Custom order ID |
| > reduceOnly      | boolean | Position reduction only |
| > fee             | string  | Fee |
| > realizedPNL     | string  | Realized PnL |
| > ctime           | int64   | Creation timestamp |
| > roleType        | string  | `TAKER` or `MAKER` |
| total             | int64   | Total count |

### Response Example
```json
{"code":0,"data":{"tradeList":[{"tradeId":"123","orderId":"11111","qty":"1","price":"60000","symbol":"BTCUSDT","positionMode":"HEDGE","marginMode":"ISOLATION","leverage":15,"fee":"0.01","realizedPNL":"1.78","type":"LIMIT","effect":"GTC","reduceOnly":false,"clientId":"22222","source":"api","ctime":1597026383085,"roleType":"TAKER"}],"total":10},"msg":"Success"}
```

---

## Get Order Detail

Source: https://www.bitunix.com/api-docs/futures/trade/get_order_detail.html

**Rate Limit**: 10 req/sec/uid

### Description
Retrieves order details.

### HTTP Request
`GET /api/v1/futures/trade/get_order_detail`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| orderId   | string | false    | Order ID. At least one of `orderId`/`clientId` required |
| clientId  | string | false    | Client ID. At least one of `orderId`/`clientId` required |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/trade/get_order_detail?orderId=12345' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json"
```

### Response Parameters
| Parameter     | Type    | Description |
|---------------|---------|-------------|
| orderId       | string  | Order ID |
| symbol        | string  | Trading Pair |
| qty           | string  | Quantity (base coin) |
| tradeQty      | string  | Filled quantity (base coin) |
| positionMode  | string  | `ONE_WAY` or `HEDGE` |
| marginMode    | string  | `ISOLATION` or `CROSS` |
| leverage      | int     | Leverage |
| price         | string  | Order price (required for `LIMIT`) |
| side          | string  | `BUY` / `SELL` |
| orderType     | string  | `LIMIT` / `MARKET` |
| effect        | string  | Time in force: `IOC`, `FOK`, `GTC` (Default), `POST_ONLY` |
| clientId      | string  | Custom order ID |
| reduceOnly    | boolean | Position reduction only |
| status        | string  | `INIT`, `NEW`, `PART_FILLED`, `CANCELED`, `FILLED` |
| fee           | string  | Fee |
| realizedPNL   | string  | Realized PnL |
| tpPrice       | string  | Take-profit trigger price |
| tpStopType    | string  | Take-profit trigger type: `MARK_PRICE` / `LAST_PRICE` |
| tpOrderType   | string  | Take-profit order type: `LIMIT` / `MARKET` |
| tpOrderPrice  | string  | Take-profit order price (required for `LIMIT`) |
| slPrice       | string  | Stop-loss trigger price |
| slStopType    | string  | Stop-loss trigger type: `MARK_PRICE` / `LAST_PRICE` |
| slOrderType   | string  | Stop-loss order type: `LIMIT` / `MARKET` |
| slOrderPrice  | string  | Stop-loss order price (required for `LIMIT`) |
| ctime         | int64   | Creation timestamp |
| mtime         | int64   | Last modification timestamp |

### Response Example
```json
{"code":0,"data":{"orderId":"11111","qty":"1","tradeQty":"0.5","price":"60000","symbol":"BTCUSDT","positionMode":"HEDGE","marginMode":"ISOLATION","leverage":15,"status":"PART_FILLED","fee":"0.01","realizedPNL":"1.78","type":"LIMIT","effect":"GTC","reduceOnly":false,"clientId":"22222","tpPrice":"61000","tpStopType":"MARK_PRICE","tpOrderType":"LIMIT","tpOrderPrice":"61000.1","slPrice":"59000","slStopType":"MARK_PRICE","slOrderType":"LIMIT","slOrderPrice":"59000.1","source":"api","ctime":1597026383085,"mtime":1597026383085},"msg":"Success"}
```

---

## Get Pending Orders

Source: https://www.bitunix.com/api-docs/futures/trade/get_pending_orders.html

**Rate Limit**: 10 req/sec/uid

### Description
Retrieves open (pending) orders, sorted by creation time in descending order.

### HTTP Request
`GET /api/v1/futures/trade/get_pending_orders`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | false    | Trading Pair |
| orderId   | string | false    | Order ID |
| clientId  | string | false    | Client ID |
| status    | string | false    | Order status: `NEW` or `PART_FILLED` |
| startTime | int64  | false    | Start timestamp, Unix ms, e.g. 1597026383085 |
| endTime   | int64  | false    | End timestamp, Unix ms, e.g. 1597026683085 |
| skip      | int64  | false    | Number of skipped orders, Default: 0 |
| limit     | int64  | false    | Max. queries: 100, Default: 10 |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/trade/get_pending_orders?symbol=BTCUSDT' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json"
```

### Response Parameters
Analogous to `Get History Orders` (see above), field `orderList` with the same
sub-parameters.

### Response Example
```json
{"code":0,"data":{"orderList":[{"orderId":"11111","qty":"1","tradeQty":"0.5","price":"60000","symbol":"BTCUSDT","positionMode":"HEDGE","marginMode":"ISOLATION","leverage":15,"status":"NEW","fee":"0.01","realizedPNL":"1.78","type":"LIMIT","effect":"GTC","reduceOnly":false,"clientId":"22222","tpPrice":"61000","tpStopType":"MARK_PRICE","tpOrderType":"LIMIT","tpOrderPrice":"61000.1","slPrice":"59000","slStopType":"MARK_PRICE","slOrderType":"LIMIT","slOrderPrice":"59000.1","source":"api","ctime":1597026383085,"mtime":1597026383085}],"total":10},"msg":"Success"}
```

---

## Modify Order

Source: https://www.bitunix.com/api-docs/futures/trade/modify_order.html

**Rate Limit**: 10 req/sec/uid

### Description
Interface for order modification, used to change an open order (e.g. TP/SL
and/or price/quantity).

### HTTP Request
`POST /api/v1/futures/trade/modify_order`

### Request Parameters
| Parameter      | Type   | Required | Description |
|----------------|--------|----------|-------------|
| orderId        | string | false    | Order ID. `orderId` or `clientId` required. If both are given, `orderId` takes precedence |
| clientId       | string | false    | Custom order ID. `orderId` or `clientId` required. If both are given, `orderId` takes precedence |
| qty            | string | true     | Quantity (base coin) (exchange requirement; Cachy Safe Modify backfills from the live order when omitted) |
| price          | string | true     | Order price (required for `LIMIT`) (exchange requirement; Cachy Safe Modify backfills from the live order when omitted) |
| tpPrice        | string | false    | Take-profit trigger price |
| tpStopType     | string | false    | Take-profit trigger type: `MARK_PRICE` / `LAST_PRICE` |
| tpOrderType    | string | false    | Take-profit order type: `LIMIT` / `MARKET` |
| tpOrderPrice   | string | false    | Take-profit order price (required for `LIMIT`) |
| slPrice        | string | false    | Stop-loss trigger price |
| slStopType     | string | false    | Stop-loss trigger type: `MARK_PRICE` / `LAST_PRICE` |
| slOrderType    | string | false    | Stop-loss order type: `LIMIT` / `MARKET` |
| slOrderPrice   | string | false    | Stop-loss order price (required for `LIMIT`) |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/trade/modify_order' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"orderId":"1111","symbol":"BTCUSDT","price":"60000","qty":"0.5","tpPrice":"61000","tpStopType":"MARK_PRICE","tpOrderType":"LIMIT","tpOrderPrice":"61000.1"}'
```

### Response Parameters
| Parameter | Type   | Description |
|-----------|--------|-------------|
| orderId   | string | Order ID |
| clientId  | string | Client ID |

### Response Example
```json
{"code":0,"data":{"orderId":"11111","clientId":"22222"},"msg":"Success"}
```

---

## Place Order

Source: https://www.bitunix.com/api-docs/futures/trade/place_order.html

**Rate Limit**: 10 req/sec/uid

### Description
Places an order.

### HTTP Request
`POST /api/v1/futures/trade/place_order`

### Request Parameters
| Parameter      | Type    | Required | Description |
|----------------|---------|----------|-------------|
| symbol         | string  | true     | Trading Pair |
| qty            | string  | true     | Quantity (base coin) |
| price          | string  | false    | Order price (required for `LIMIT`) |
| side           | string  | true     | Order side: `BUY` / `SELL` |
| tradeSide      | string  | true     | Only required in hedge mode. `OPEN`/`CLOSE`. Open Long: side=`BUY`, tradeSide=`OPEN`. Open Short: side=`SELL`, tradeSide=`OPEN`. Close Long: side=`BUY`, tradeSide=`CLOSE`. Close Short: side=`SELL`, tradeSide=`CLOSE` |
| positionId     | string  | false    | Position ID. Required if `tradeSide` = `CLOSE` |
| orderType      | string  | true     | Order type: `LIMIT` / `MARKET` |
| effect         | string  | false    | Time in force, required for `LIMIT`: `IOC`, `FOK`, `GTC` (Default), `POST_ONLY` |
| clientId       | string  | false    | Custom order ID |
| reduceOnly     | boolean | false    | Position reduction only |
| tpPrice        | string  | false    | Take-profit trigger price |
| tpStopType     | string  | false    | Take-profit trigger type: `MARK_PRICE` / `LAST_PRICE` |
| tpOrderType    | string  | false    | Take-profit order type: `LIMIT` / `MARKET` |
| tpOrderPrice   | string  | false    | Take-profit order price (required for `LIMIT`) |
| slPrice        | string  | false    | Stop-loss trigger price |
| slStopType     | string  | false    | Stop-loss trigger type: `MARK_PRICE` / `LAST_PRICE` |
| slOrderType    | string  | false    | Stop-loss order type: `LIMIT` / `MARKET` |
| slOrderPrice   | string  | false    | Stop-loss order price (required for `LIMIT`) |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/trade/place_order' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"symbol":"BTCUSDT","side":"BUY","price":"60000","qty":"0.5","positionId":"111","tradeSide":"CLOSE","orderType":"LIMIT","reduceOnly":false,"effect":"GTC","clientId":"1110000aaa","tpPrice":"61000","tpStopType":"MARK_PRICE","tpOrderType":"LIMIT","tpOrderPrice":"61000.1"}'
```

### Response Parameters
| Parameter | Type   | Description |
|-----------|--------|-------------|
| orderId   | string | Order ID |
| clientId  | string | Client ID |

### Response Example
```json
{"code":0,"data":{"orderId":"11111","clientId":"22222"},"msg":"Success"}
```
