# TP/SL (Take Profit / Stop Loss) Endpoints

All endpoints are **private** interfaces and require a signature (see `01_sign.md`).

> ⚠️ **Important**: For interfaces that modify, create or delete orders
> the following applies: A successful interface response does not necessarily
> mean that the operation succeeded. Use the WebSocket push message as
> reliable confirmation.

---

## Cancel TP/SL Order

Source: https://www.bitunix.com/api-docs/futures/tp_sl/cancel_tp_sl_order.html

**Rate Limit**: 10 req/sec/UID

### Description
Cancels a TP/SL order.

### HTTP Request
`POST /api/v1/futures/tpsl/cancel_order`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | true     | Coin Pair |
| orderId   | string | true     | TP/SL Order ID |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/tpsl/cancel_order' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"symbol":"BTCUSDT","orderId":"12"}'
```

### Response Parameters
| Parameter | Type   | Description |
|-----------|--------|-------------|
| orderId   | string | TP/SL Order ID |

### Response Example
```json
{"code":0,"data":{"orderId":"11111"},"msg":"Success"}
```

---

## Get History TP/SL Order

Source: https://www.bitunix.com/api-docs/futures/tp_sl/get_history_tp_sl_order.html

**Rate Limit**: 10 req/sec/uid

### Description
Retrieves historical TP/SL orders.

### HTTP Request
`GET /api/v1/futures/tpsl/get_history_orders`

### Request Parameters
| Parameter     | Type   | Required | Description |
|---------------|--------|----------|-------------|
| symbol        | string | false    | Trading Pair |
| side          | int32  | false    | Order Side (as documented; unconfirmed) |
| positionMode  | int32  | false    | Order Position Mode (as documented; unconfirmed) |
| startTime     | int64  | false    | Start timestamp, Unix ms, e.g. 1597026383085 |
| endTime       | int64  | false    | End timestamp, Unix ms, e.g. 1597026683085 |
| skip          | int64  | false    | Number of skipped orders, Default: 0 |
| limit         | int64  | false    | Max. queries: 100, Default: 10 |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/tpsl/get_history_orders?symbol=BTCUSDT' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json"
```

### Response Parameters
| Parameter        | Type   | Description |
|-------------------|--------|-------------|
| orderList         | list   | TP/SL Order list |
| > id              | string | Order ID |
| > positionId      | string | Position ID |
| > symbol          | string | Coin Pair |
| > base            | string | Base coin |
| > quote           | string | Quote coin |
| > tpPrice         | string | Take-profit trigger price |
| > tpStopType      | string | Take-profit trigger type: `LAST_PRICE` / `MARK_PRICE` |
| > slPrice         | string | Stop-loss trigger price |
| > slStopType      | string | Stop-loss trigger type: `LAST_PRICE` / `MARK_PRICE` |
| > tpOrderType     | string | Take-profit order type: `LIMIT` / `MARKET` (Default: Market) |
| > tpOrderPrice    | string | Take-profit order price |
| > slOrderType     | string | Stop-loss order type: `LIMIT` / `MARKET` (Default: Market) |
| > slOrderPrice    | string | Stop-loss order price |
| > tpQty           | string | Take-profit order quantity (base coin). At least one of `tpQty`/`slQty` required |
| > slQty           | string | Stop-loss order quantity (base coin). At least one of `tpQty`/`slQty` required |
| > status          | string | TP/SL order status |
| > ctime           | int64  | Creation timestamp |
| > triggerTime     | int64  | Trigger time timestamp |
| total             | int64  | Total count |

### Response Example
```json
{"code":0,"data":{"total":1,"orderList":[{"id":"1836413742817685504","positionId":"1836413742817685504","symbol":"BTCUSDT","tpPrice":"70000","tpStopType":"MARK_PRICE","slPrice":"60000","slStopType":"MARK_PRICE","tpOrderType":"MARKET","slOrderType":"MARKET","tpQty":"0.5","slQty":"0.5","status":"FILLED","ctime":1691382137448,"triggerTime":1691382150000}]},"msg":"Success"}
```

> Upstream example previously showed position fields here; corrected to TP/SL shape.

### Cachy normalization

One venue row carries both legs; the app splits it into `${id}-tp` / `${id}-sl` legs (`tpslNormalize.ts`). Cancel/modify must use `sourceOrderId`; scope (position-wide vs partial) is a guess from the presence of qty, not a venue field.

---

## Get Pending TP/SL Order

Source: https://www.bitunix.com/api-docs/futures/tp_sl/get_pending_tp_sl_order.html

**Rate Limit**: 10 req/sec/uid

### Description
Retrieves open (pending) TP/SL orders.

### HTTP Request
`GET /api/v1/futures/tpsl/get_pending_orders`

### Request Parameters
| Parameter     | Type   | Required | Description |
|---------------|--------|----------|-------------|
| symbol        | string | false    | Trading Pair |
| positionId    | string | false    | Position ID |
| side          | int32  | false    | Order Side |
| positionMode  | int32  | false    | Order Position Mode |
| skip          | int64  | false    | Number of skipped orders, Default: 0 |
| limit         | int64  | false    | Max. queries: 100, Default: 10 |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/tpsl/get_pending_orders?symbol=BTCUSDT' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json"
```

### Response Parameters
| Parameter      | Type   | Description |
|----------------|--------|-------------|
| id             | string | Order ID |
| positionId     | string | Position ID |
| symbol         | string | Coin Pair |
| base           | string | Base coin |
| quote          | string | Quote coin |
| tpPrice        | string | Take-profit trigger price |
| tpStopType     | string | Take-profit trigger type: `LAST_PRICE` / `MARK_PRICE` |
| slPrice        | string | Stop-loss trigger price |
| slStopType     | string | Stop-loss trigger type: `LAST_PRICE` / `MARK_PRICE` |
| tpOrderType    | string | Take-profit order type: `LIMIT` / `MARKET` (Default: Market) |
| tpOrderPrice   | string | Take-profit order price |
| slOrderType    | string | Stop-loss order type: `LIMIT` / `MARKET` (Default: Market) |
| slOrderPrice   | string | Stop-loss order price |
| tpQty          | string | Take-profit order quantity (base coin). At least one of `tpQty`/`slQty` required |
| slQty          | string | Stop-loss order quantity (base coin). At least one of `tpQty`/`slQty` required |

### Response Example
```json
{"code":0,"data":[{"id":"123","positionId":"12345678","symbol":"BTCUSDT","base":"BTC","quote":"USDT","tpPrice":"50000","tpStopType":"LAST_PRICE","slPrice":"70000","slStopType":"LAST_PRICE","tpOrderType":"LIMIT","tpOrderPrice":"50000","slOrderType":"LIMIT","slOrderPrice":"70000","tpQty":"0.01","slQty":"0.01"}],"msg":"Success"}
```

---

## Modify Position TP/SL Order

Source: https://www.bitunix.com/api-docs/futures/tp_sl/modify_position_tp_sl_order.html

**Rate Limit**: 10 req/sec/UID

### Description
Modifies a position TP/SL order.

### HTTP Request
`POST /api/v1/futures/tpsl/position/modify_order`

### Request Parameters
| Parameter   | Type   | Required | Description |
|-------------|--------|----------|-------------|
| symbol      | string | true     | Trading Pair |
| positionId  | string | true     | Position ID, linked to take-profit and stop-loss |
| tpPrice     | string | false    | Take-profit trigger price. At least one of `tpPrice`/`slPrice` required |
| tpStopType  | string | false    | Take-profit trigger type: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |
| slPrice     | string | false    | Stop-loss trigger price. At least one of `tpPrice`/`slPrice` required |
| slStopType  | string | false    | Stop-loss trigger type: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/tpsl/position/modify_order' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"symbol":"BTCUSDT","positionId":"11","tpPrice":"12","tpStopType":"LAST_PRICE","slPrice":"9","slStopType":"LAST_PRICE"}'
```

### Response Parameters
| Parameter | Type   | Description |
|-----------|--------|-------------|
| orderId   | string | TP/SL Order ID |

### Response Example
```json
{"code":0,"data":{"orderId":"11111"},"msg":"Success"}
```

---

## Modify TP/SL Order

Source: https://www.bitunix.com/api-docs/futures/tp_sl/modify_tp_sl_order.html

**Rate Limit**: 10 req/sec/UID

### Description
Modifies a TP/SL order.

### HTTP Request
`POST /api/v1/futures/tpsl/modify_order`

### Request Parameters
| Parameter      | Type   | Required | Description |
|----------------|--------|----------|-------------|
| orderId        | string | true     | TP/SL Order ID |
| tpPrice        | string | false    | Take-profit trigger price. At least one of `tpPrice`/`slPrice` required |
| tpStopType     | string | false    | Take-profit trigger type: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |
| slPrice        | string | false    | Stop-loss trigger price. At least one of `tpPrice`/`slPrice` required |
| slStopType     | string | false    | Stop-loss trigger type: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |
| tpOrderType    | string | false    | Take-profit order type: `LIMIT` / `MARKET` (Default: Market) |
| tpOrderPrice   | string | false    | Take-profit order price |
| slOrderType    | string | false    | Stop-loss order type: `LIMIT` / `MARKET` (Default: Market) |
| slOrderPrice   | string | false    | Stop-loss order price |
| tpQty          | string | false    | Take-profit order quantity (base coin). At least one of `tpQty`/`slQty` required |
| slQty          | string | false    | Stop-loss order quantity (base coin). At least one of `tpQty`/`slQty` required |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/tpsl/modify_order' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"orderId":"123","tpPrice":"12","tpStopType":"LAST_PRICE","slPrice":"9","slStopType":"LAST_PRICE","tpOrderType":"LIMIT","tpOrderPrice":"11","slOrderType":"LIMIT","slOrderPrice":"8","tpQty":"1","slQty":"1"}'
```

### Response Parameters
| Parameter | Type   | Description |
|-----------|--------|-------------|
| orderId   | string | TP/SL Order ID |

### Response Example
```json
{"code":0,"data":{"orderId":"11111"},"msg":"Success"}
```

---

## Place Position TP/SL Order

Source: https://www.bitunix.com/api-docs/futures/tp_sl/place_position_tp_sl_order.html

**Rate Limit**: 10 req/sec/UID

### Description
Places a position TP/SL order. On trigger the position is closed at the
market price based on the position quantity current at that point in time.
**Each position can only have one position TP/SL order.**

### HTTP Request
`POST /api/v1/futures/tpsl/position/place_order`

### Request Parameters
| Parameter   | Type   | Required | Description |
|-------------|--------|----------|-------------|
| symbol      | string | true     | Trading Pair |
| positionId  | string | true     | Position ID, linked to take-profit and stop-loss |
| tpPrice     | string | false    | Take-profit trigger price. At least one of `tpPrice`/`slPrice` required |
| tpStopType  | string | false    | Take-profit trigger type: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |
| slPrice     | string | false    | Stop-loss trigger price. At least one of `tpPrice`/`slPrice` required |
| slStopType  | string | false    | Stop-loss trigger type: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/tpsl/position/place_order' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"symbol":"BTCUSDT","positionId":"111","tpPrice":"12","tpStopType":"LAST_PRICE","slPrice":"9","slStopType":"LAST_PRICE"}'
```

### Response Parameters
| Parameter | Type   | Description |
|-----------|--------|-------------|
| orderId   | string | TP/SL Order ID |

### Response Example
```json
{"code":0,"data":{"orderId":"11111"},"msg":"Success"}
```

---

## Place TP/SL Order

Source: https://www.bitunix.com/api-docs/futures/tp_sl/place_tp_sl_order.html

**Rate Limit**: 10 req/sec/UID

### Description
Places a TP/SL order (with a fixed quantity, independent of the
position TP/SL order).

### HTTP Request
`POST /api/v1/futures/tpsl/place_order`

### Request Parameters
| Parameter      | Type   | Required | Description |
|----------------|--------|----------|-------------|
| symbol         | string | true     | Trading Pair |
| positionId     | string | true     | Position ID, linked to take-profit and stop-loss |
| tpPrice        | string | false    | Take-profit trigger price. At least one of `tpPrice`/`slPrice` required |
| tpStopType     | string | false    | Take-profit trigger type: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |
| slPrice        | string | false    | Stop-loss trigger price. At least one of `tpPrice`/`slPrice` required |
| slStopType     | string | false    | Stop-loss trigger type: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |
| tpOrderType    | string | false    | Take-profit order type: `LIMIT` / `MARKET` (Default: Market) |
| tpOrderPrice   | string | false    | Take-profit order price |
| slOrderType    | string | false    | Stop-loss order type: `LIMIT` / `MARKET` (Default: Market) |
| slOrderPrice   | string | false    | Stop-loss order price |
| tpQty          | string | false    | Take-profit order quantity (base coin). At least one of `tpQty`/`slQty` required |
| slQty          | string | false    | Stop-loss order quantity (base coin). At least one of `tpQty`/`slQty` required |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/tpsl/place_order' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"symbol":"BTCUSDT","positionId":"111","tpPrice":"12","tpStopType":"LAST_PRICE","slPrice":"9","slStopType":"LAST_PRICE","tpOrderType":"LIMIT","tpOrderPrice":"11","slOrderType":"LIMIT","slOrderPrice":"8","tpQty":"1","slQty":"1"}'
```

### Response Parameters
| Parameter | Type   | Description |
|-----------|--------|-------------|
| orderId   | string | TP/SL Order ID |

### Response Example
```json
{"code":0,"data":{"orderId":"11111"},"msg":"Success"}
```
