# TP/SL (Take Profit / Stop Loss) Endpoints

Alle Endpunkte sind **private** Interfaces und erfordern Signatur (siehe `01_sign.md`).

> ⚠️ **Wichtig**: Bei ordermodifizierenden/-erstellenden/-löschenden Interfaces
> gilt: Eine erfolgreiche Interface-Antwort bedeutet nicht zwangsläufig, dass
> die Operation erfolgreich war. Nutze die WebSocket-Push-Nachricht als
> verlässliche Bestätigung.

---

## Cancel TP/SL Order

Quelle: https://www.bitunix.com/api-docs/futures/tp_sl/cancel_tp_sl_order.html

**Rate Limit**: 10 req/sec/UID

### Description
Storniert eine TP/SL-Order.

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

Quelle: https://www.bitunix.com/api-docs/futures/tp_sl/get_history_tp_sl_order.html

**Rate Limit**: 10 req/sec/uid

### Description
Ruft historische TP/SL-Orders ab.

### HTTP Request
`GET /api/v1/futures/tpsl/get_history_orders`

### Request Parameters
| Parameter     | Type   | Required | Description |
|---------------|--------|----------|-------------|
| symbol        | string | false    | Trading Pair |
| side          | int32  | false    | Order Side |
| positionMode  | int32  | false    | Order Position Mode |
| startTime     | int64  | false    | Start-Timestamp, Unix ms, z.B. 1597026383085 |
| endTime       | int64  | false    | End-Timestamp, Unix ms, z.B. 1597026683085 |
| skip          | int64  | false    | Anzahl übersprungener Orders, Default: 0 |
| limit         | int64  | false    | Max. Abfragen: 100, Default: 10 |

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
| orderList         | list   | TP/SL Order-Liste |
| > id              | string | Order ID |
| > positionId      | string | Position ID |
| > symbol          | string | Coin Pair |
| > base            | string | Base-Coin |
| > quote           | string | Quote-Coin |
| > tpPrice         | string | Take-Profit-Trigger-Preis |
| > tpStopType      | string | Take-Profit-Trigger-Typ: `LAST_PRICE` / `MARK_PRICE` |
| > slPrice         | string | Stop-Loss-Trigger-Preis |
| > slStopType      | string | Stop-Loss-Trigger-Typ: `LAST_PRICE` / `MARK_PRICE` |
| > tpOrderType     | string | Take-Profit-Order-Typ: `LIMIT` / `MARKET` (Default: Market) |
| > tpOrderPrice    | string | Take-Profit-Order-Preis |
| > slOrderType     | string | Stop-Loss-Order-Typ: `LIMIT` / `MARKET` (Default: Market) |
| > slOrderPrice    | string | Stop-Loss-Order-Preis |
| > tpQty           | string | Take-Profit-Order-Menge (Base-Coin). Mind. eines von `tpQty`/`slQty` erforderlich |
| > slQty           | string | Stop-Loss-Order-Menge (Base-Coin). Mind. eines von `tpQty`/`slQty` erforderlich |
| > status          | string | TP/SL Order-Status |
| > ctime           | int64  | Erstell-Timestamp |
| > triggerTime     | int64  | Trigger-Zeit-Timestamp |
| total             | int64  | Gesamtanzahl |

### Response Example
```json
{"code":0,"data":[{"positionId":"12345678","symbol":"BTCUSDT","qty":"0.5","entryValue":"30000","side":"LONG","positionMode":"HEDGE","marginMode":"ISOLATION","leverage":100,"fee":"0.1","funding":"-0.2","realizedPNL":"102.9","margin":"300","unrealizedPNL":"1.5","liqPrice":"22209","marginRate":"0.01","ctime":1691382137448,"mtime":1691382137448}],"msg":"Success"}
```

---

## Get Pending TP/SL Order

Quelle: https://www.bitunix.com/api-docs/futures/tp_sl/get_pending_tp_sl_order.html

**Rate Limit**: 10 req/sec/uid

### Description
Ruft offene (pending) TP/SL-Orders ab.

### HTTP Request
`GET /api/v1/futures/tpsl/get_pending_orders`

### Request Parameters
| Parameter     | Type   | Required | Description |
|---------------|--------|----------|-------------|
| symbol        | string | false    | Trading Pair |
| positionId    | string | false    | Position ID |
| side          | int32  | false    | Order Side |
| positionMode  | int32  | false    | Order Position Mode |
| skip          | int64  | false    | Anzahl übersprungener Orders, Default: 0 |
| limit         | int64  | false    | Max. Abfragen: 100, Default: 10 |

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
| base           | string | Base-Coin |
| quote          | string | Quote-Coin |
| tpPrice        | string | Take-Profit-Trigger-Preis |
| tpStopType     | string | Take-Profit-Trigger-Typ: `LAST_PRICE` / `MARK_PRICE` |
| slPrice        | string | Stop-Loss-Trigger-Preis |
| slStopType     | string | Stop-Loss-Trigger-Typ: `LAST_PRICE` / `MARK_PRICE` |
| tpOrderType    | string | Take-Profit-Order-Typ: `LIMIT` / `MARKET` (Default: Market) |
| tpOrderPrice   | string | Take-Profit-Order-Preis |
| slOrderType    | string | Stop-Loss-Order-Typ: `LIMIT` / `MARKET` (Default: Market) |
| slOrderPrice   | string | Stop-Loss-Order-Preis |
| tpQty          | string | Take-Profit-Order-Menge (Base-Coin). Mind. eines von `tpQty`/`slQty` erforderlich |
| slQty          | string | Stop-Loss-Order-Menge (Base-Coin). Mind. eines von `tpQty`/`slQty` erforderlich |

### Response Example
```json
{"code":0,"data":[{"id":"123","positionId":"12345678","symbol":"BTCUSDT","base":"BTC","quote":"USDT","tpPrice":"50000","tpStopType":"LAST_PRICE","slPrice":"70000","slStopType":"LAST_PRICE","tpOrderType":"LIMIT","tpOrderPrice":"50000","slOrderType":"LIMIT","slOrderPrice":"70000","tpQty":"0.01","slQty":"0.01"}],"msg":"Success"}
```

---

## Modify Position TP/SL Order

Quelle: https://www.bitunix.com/api-docs/futures/tp_sl/modify_position_tp_sl_order.html

**Rate Limit**: 10 req/sec/UID

### Description
Modifiziert eine Position-TP/SL-Order.

### HTTP Request
`POST /api/v1/futures/tpsl/position/modify_order`

### Request Parameters
| Parameter   | Type   | Required | Description |
|-------------|--------|----------|-------------|
| symbol      | string | true     | Trading Pair |
| positionId  | string | true     | Position ID, verknüpft mit Take-Profit und Stop-Loss |
| tpPrice     | string | false    | Take-Profit-Trigger-Preis. Mind. eines von `tpPrice`/`slPrice` erforderlich |
| tpStopType  | string | false    | Take-Profit-Trigger-Typ: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |
| slPrice     | string | false    | Stop-Loss-Trigger-Preis. Mind. eines von `tpPrice`/`slPrice` erforderlich |
| slStopType  | string | false    | Stop-Loss-Trigger-Typ: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |

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

Quelle: https://www.bitunix.com/api-docs/futures/tp_sl/modify_tp_sl_order.html

**Rate Limit**: 10 req/sec/UID

### Description
Modifiziert eine TP/SL-Order.

### HTTP Request
`POST /api/v1/futures/tpsl/modify_order`

### Request Parameters
| Parameter      | Type   | Required | Description |
|----------------|--------|----------|-------------|
| orderId        | string | true     | TP/SL Order ID |
| tpPrice        | string | false    | Take-Profit-Trigger-Preis. Mind. eines von `tpPrice`/`slPrice` erforderlich |
| tpStopType     | string | false    | Take-Profit-Trigger-Typ: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |
| slPrice        | string | false    | Stop-Loss-Trigger-Preis. Mind. eines von `tpPrice`/`slPrice` erforderlich |
| slStopType     | string | false    | Stop-Loss-Trigger-Typ: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |
| tpOrderType    | string | false    | Take-Profit-Order-Typ: `LIMIT` / `MARKET` (Default: Market) |
| tpOrderPrice   | string | false    | Take-Profit-Order-Preis |
| slOrderType    | string | false    | Stop-Loss-Order-Typ: `LIMIT` / `MARKET` (Default: Market) |
| slOrderPrice   | string | false    | Stop-Loss-Order-Preis |
| tpQty          | string | false    | Take-Profit-Order-Menge (Base-Coin). Mind. eines von `tpQty`/`slQty` erforderlich |
| slQty          | string | false    | Stop-Loss-Order-Menge (Base-Coin). Mind. eines von `tpQty`/`slQty` erforderlich |

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

Quelle: https://www.bitunix.com/api-docs/futures/tp_sl/place_position_tp_sl_order.html

**Rate Limit**: 10 req/sec/UID

### Description
Platziert eine Position-TP/SL-Order. Bei Trigger wird die Position zum
Marktpreis basierend auf der zu diesem Zeitpunkt aktuellen Positionsmenge
geschlossen. **Jede Position kann nur eine Position-TP/SL-Order haben.**

### HTTP Request
`POST /api/v1/futures/tpsl/position/place_order`

### Request Parameters
| Parameter   | Type   | Required | Description |
|-------------|--------|----------|-------------|
| symbol      | string | true     | Trading Pair |
| positionId  | string | true     | Position ID, verknüpft mit Take-Profit und Stop-Loss |
| tpPrice     | string | false    | Take-Profit-Trigger-Preis. Mind. eines von `tpPrice`/`slPrice` erforderlich |
| tpStopType  | string | false    | Take-Profit-Trigger-Typ: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |
| slPrice     | string | false    | Stop-Loss-Trigger-Preis. Mind. eines von `tpPrice`/`slPrice` erforderlich |
| slStopType  | string | false    | Stop-Loss-Trigger-Typ: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |

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

Quelle: https://www.bitunix.com/api-docs/futures/tp_sl/place_tp_sl_order.html

**Rate Limit**: 10 req/sec/UID

### Description
Platziert eine TP/SL-Order (mit fester Menge, unabhängig von der
Position-TP/SL-Order).

### HTTP Request
`POST /api/v1/futures/tpsl/place_order`

### Request Parameters
| Parameter      | Type   | Required | Description |
|----------------|--------|----------|-------------|
| symbol         | string | true     | Trading Pair |
| positionId     | string | true     | Position ID, verknüpft mit Take-Profit und Stop-Loss |
| tpPrice        | string | false    | Take-Profit-Trigger-Preis. Mind. eines von `tpPrice`/`slPrice` erforderlich |
| tpStopType     | string | false    | Take-Profit-Trigger-Typ: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |
| slPrice        | string | false    | Stop-Loss-Trigger-Preis. Mind. eines von `tpPrice`/`slPrice` erforderlich |
| slStopType     | string | false    | Stop-Loss-Trigger-Typ: `LAST_PRICE` / `MARK_PRICE` (Default: Market Price) |
| tpOrderType    | string | false    | Take-Profit-Order-Typ: `LIMIT` / `MARKET` (Default: Market) |
| tpOrderPrice   | string | false    | Take-Profit-Order-Preis |
| slOrderType    | string | false    | Stop-Loss-Order-Typ: `LIMIT` / `MARKET` (Default: Market) |
| slOrderPrice   | string | false    | Stop-Loss-Order-Preis |
| tpQty          | string | false    | Take-Profit-Order-Menge (Base-Coin). Mind. eines von `tpQty`/`slQty` erforderlich |
| slQty          | string | false    | Stop-Loss-Order-Menge (Base-Coin). Mind. eines von `tpQty`/`slQty` erforderlich |

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
