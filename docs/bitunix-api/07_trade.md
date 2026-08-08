# Trade Endpoints

Alle Endpunkte sind **private** Interfaces und erfordern Signatur (siehe `01_sign.md`).

> ⚠️ **Wichtig**: Bei ordermodifizierenden/-erstellenden/-löschenden Interfaces
> gilt: Eine erfolgreiche Interface-Antwort bedeutet nicht zwangsläufig, dass
> die Operation erfolgreich war. Nutze die WebSocket-Push-Nachricht als
> verlässliche Bestätigung.

---

## Batch Order

Quelle: https://www.bitunix.com/api-docs/futures/trade/batch_order.html

**Rate Limit**: 1 req/sec/uid

### Description
Platziert mehrere Orders in einem Request (max. 5).

### HTTP Request
`POST /api/v1/futures/trade/batch_order`

### Request Parameters
| Parameter       | Type    | Required | Description |
|-----------------|---------|----------|-------------|
| symbol          | string  | true     | Trading Pair |
| orderList       | list    | true     | Order-Liste, max. Länge: 5 |
| > qty           | string  | true     | Menge (Base-Coin) |
| > price         | string  | false    | Orderpreis. Erforderlich bei Ordertyp `LIMIT` |
| > side          | string  | true     | Order-Richtung: `BUY` / `SELL` |
| > tradeSide     | string  | true     | Nur im Hedge-Modus erforderlich. `OPEN`/`CLOSE`. Open Long: side=`BUY`, tradeSide=`OPEN`. Open Short: side=`SELL`, tradeSide=`OPEN`. Close Long: side=`BUY`, tradeSide=`CLOSE`. Close Short: side=`SELL`, tradeSide=`CLOSE` |
| > positionId    | string  | false    | Position ID. Erforderlich, wenn `tradeSide` = `CLOSE` |
| > orderType     | string  | true     | Ordertyp: `LIMIT` / `MARKET` |
| > effect        | string  | false    | Gültigkeitsdauer, erforderlich bei `orderType=LIMIT`: `IOC` (Immediate or Cancel), `FOK` (Fill or Kill), `GTC` (Good till Canceled, Default), `POST_ONLY` |
| > clientId      | string  | false    | Individuelle Order-ID |
| > reduceOnly    | boolean | false    | Nur Positionsreduzierung |
| > tpPrice       | string  | false    | Take-Profit-Trigger-Preis |
| > tpStopType    | string  | false    | Take-Profit-Trigger-Typ: `MARK_PRICE` / `LAST_PRICE` |
| > tpOrderType   | string  | false    | Take-Profit-Order-Typ: `LIMIT` / `MARKET` |
| > tpOrderPrice  | string  | false    | Take-Profit-Order-Preis (erforderlich bei `tpOrderType=LIMIT`) |
| > slPrice       | string  | false    | Stop-Loss-Trigger-Preis |
| > slStopType    | string  | false    | Stop-Loss-Trigger-Typ: `MARK_PRICE` / `LAST_PRICE` |
| > slOrderType   | string  | false    | Stop-Loss-Order-Typ: `LIMIT` / `MARKET` |
| > slOrderPrice  | string  | false    | Stop-Loss-Order-Preis (erforderlich bei `slOrderType=LIMIT`) |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/trade/batch_order' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"symbol":"BTCUSDT","orderList":[{"side":"BUY","price":"60000","qty":"0.5","orderType":"LIMIT","reduceOnly":false,"effect":"GTC","clientId":"c12345","tpPrice":"61000","tpStopType":"MARK","tpOrderType":"LIMIT","tpOrderPrice":"61000.1","slPrice":"59000","slStopType":"LAST","slOrderType":"MARKET"},{"side":"SELL","price":"61000","qty":"0.5","orderType":"LIMIT","reduceOnly":false,"effect":"IOC","clientId":"c12346"}]}'
```

### Response Parameters
| Parameter     | Type   | Description |
|---------------|--------|-------------|
| successList   | list   | Liste erfolgreicher Orders |
| > id          | string | Order ID |
| > clientId    | string | Client ID |
| failureList   | list   | Liste fehlgeschlagener Orders |
| > clientId    | string | Client ID |
| > errorMsg    | string | Fehlermeldung |
| > errorCode   | string | Fehlercode |

### Response Example
```json
{"code":0,"data":{"successList":[{"id":"11111","clientId":"22222"}],"failureList":[{"clientId":"22222","errorMsg":"Insufficient balance","errorCode":10012}]},"msg":"Success"}
```

---

## Cancel All Orders

Quelle: https://www.bitunix.com/api-docs/futures/trade/cancel_all_orders.html

**Rate Limit**: 10 req/sec/uid

### Description
Storniert alle Orders.

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
| successList   | list   | Liste erfolgreicher Orders |
| > id          | string | Order ID |
| > clientId    | string | Client ID |
| failureList   | list   | Liste fehlgeschlagener Orders |
| > id          | string | Order ID |
| > clientId    | string | Client ID |
| > errorMsg    | string | Fehlermeldung |
| > errorCode   | string | Fehlercode |

### Response Example
```json
{"code":0,"data":{"successList":[{"orderId":"11111","clientId":"22222"}],"failureList":[{"orderId":"11112","clientId":"22223","errorMsg":"Order status error","errorCode":10013}]},"msg":"Success"}
```

---

## Cancel Orders

Quelle: https://www.bitunix.com/api-docs/futures/trade/cancel_orders.html

**Rate Limit**: 5 req/sec/uid

### Description
Storniert bestimmte Orders.

### HTTP Request
`POST /api/v1/futures/trade/cancel_orders`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | true     | Trading Pair |
| orderList | list   | true     | Liste der Order-Parameter |
| orderId   | string | false    | Order ID. `orderId` oder `clientId` erforderlich. Bei beiden hat `orderId` Vorrang |
| clientId  | string | false    | Individuelle Order-ID. `orderId` oder `clientId` erforderlich. Bei beiden hat `orderId` Vorrang |

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
| successList   | list   | Liste erfolgreicher Orders |
| > id          | string | Order ID |
| > clientId    | string | Client ID |
| failureList   | list   | Liste fehlgeschlagener Orders |
| > id          | string | Order ID |
| > clientId    | string | Client ID |
| > errorMsg    | string | Fehlermeldung |
| > errorCode   | string | Fehlercode |

### Response Example
```json
{"code":0,"data":{"successList":[{"orderId":"11111","clientId":"22222"}],"failureList":[{"orderId":"11112","clientId":"22223","errorMsg":"Order status error","errorCode":10013}]},"msg":"Success"}
```

---

## Close All Position

Quelle: https://www.bitunix.com/api-docs/futures/trade/close_all_position.html

**Rate Limit**: 1 req/sec/uid

### Description
Schließt alle Positionen.

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
Keine.

### Response Example
```json
{"code":0,"data":"","msg":"Success"}
```

---

## Flash Close Position

Quelle: https://www.bitunix.com/api-docs/futures/trade/flash_close_position.html

**Rate Limit**: 5 req/sec/uid

### Description
Schließt eine Position anhand der Position-ID (Market Order).

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

Quelle: https://www.bitunix.com/api-docs/futures/trade/get_history_orders.html

**Rate Limit**: 10 req/sec/uid

### Description
Ruft historische Orders ab, sortiert nach Erstellzeit absteigend.

### HTTP Request
`GET /api/v1/futures/trade/get_history_orders`

### Request Parameters
| Parameter       | Type    | Required | Description |
|-----------------|---------|----------|-------------|
| symbol          | string  | false    | Trading Pair |
| orderId         | string  | false    | Order ID |
| clientId        | string  | false    | Client ID |
| status          | string  | false    | Order-Status: `FILLED`, `CANCELED`, `PART_FILLED_CANCELED`, `EXPIRED` |
| type            | string  | false    | Ordertyp: `LIMIT`, `MARKET`, default alle |
| startTime       | int64   | false    | Start-Timestamp, Unix ms, z.B. 1597026383085 |
| endTime         | int64   | false    | End-Timestamp, Unix ms, z.B. 1597026683085 |
| skip            | int64   | false    | Anzahl übersprungener Orders, Default: 0 |
| limit           | int64   | false    | Max. Abfragen: 100, Default: 10 |
| subAccountId    | int64   | false    | Mit `subAccountId`: nur historische Orders dieses Subaccounts. Ohne: Orders des Hauptaccounts |
| queryCanceled   | boolean | false    | Ob nur stornierte Orders abgefragt werden sollen. Default: `false`. `true`: nur stornierte Orders (max. 3 Tage rückwirkend); `false`: ohne stornierte Orders (max. 90 Tage rückwirkend) |

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
| orderList         | list    | Order-Liste |
| > orderId         | string  | Order ID |
| > symbol          | string  | Trading Pair |
| > qty             | string  | Menge (Base-Coin) |
| > tradeQty        | string  | Ausgeführte Menge (Base-Coin) |
| > positionMode    | string  | `ONE_WAY` oder `HEDGE` |
| > marginMode      | string  | `ISOLATION` oder `CROSS` |
| > leverage        | int     | Leverage |
| > price           | string  | Orderpreis (erforderlich bei `LIMIT`) |
| > side            | string  | `BUY` / `SELL` |
| > orderType       | string  | `LIMIT` / `MARKET` |
| > effect          | string  | Gültigkeitsdauer: `IOC`, `FOK`, `GTC` (Default), `POST_ONLY` |
| > clientId        | string  | Individuelle Order-ID |
| > reduceOnly      | boolean | Nur Positionsreduzierung |
| > status          | string  | `INIT`, `NEW`, `PART_FILLED`, `CANCELED`, `FILLED` |
| > fee             | string  | Gebühr |
| > realizedPNL     | string  | Realized PnL |
| > tpPrice         | string  | Take-Profit-Trigger-Preis |
| > tpStopType      | string  | Take-Profit-Trigger-Typ: `MARK_PRICE` / `LAST_PRICE` |
| > tpOrderType     | string  | Take-Profit-Order-Typ: `LIMIT` / `MARKET` |
| > tpOrderPrice    | string  | Take-Profit-Order-Preis (erforderlich bei `LIMIT`) |
| > slPrice         | string  | Stop-Loss-Trigger-Preis |
| > slStopType      | string  | Stop-Loss-Trigger-Typ: `MARK_PRICE` / `LAST_PRICE` |
| > slOrderType     | string  | Stop-Loss-Order-Typ: `LIMIT` / `MARKET` |
| > slOrderPrice    | string  | Stop-Loss-Order-Preis (erforderlich bei `LIMIT`) |
| > ctime           | int64   | Erstell-Timestamp |
| > mtime           | int64   | Letzter Änderungs-Timestamp |
| > subAccountId    | int64   | Order-Account-ID |
| total             | int64   | Gesamtanzahl |

### Response Example
```json
{"code":0,"data":{"orderList":[{"orderId":"11111","qty":"1","tradeQty":"0.5","price":"60000","symbol":"BTCUSDT","positionMode":"HEDGE","marginMode":"ISOLATION","leverage":15,"status":"CANCELED","fee":"0.01","realizedPNL":"1.78","type":"LIMIT","effect":"GTC","reduceOnly":false,"clientId":"22222","tpPrice":"61000","tpStopType":"MARK","tpOrderType":"LIMIT","tpOrderPrice":"61000.1","slPrice":"59000","slStopType":"MARK","slOrderType":"LIMIT","slOrderPrice":"59000.1","source":"api","ctime":1597026383085,"mtime":1597026383085}],"total":10},"msg":"Success"}
```

---

## Get History Trades

Quelle: https://www.bitunix.com/api-docs/futures/trade/get_history_trades.html

**Rate Limit**: 10 req/sec/uid

### Description
Ruft historische Trades ab, sortiert nach Erstellzeit absteigend.

### HTTP Request
`GET /api/v1/futures/trade/get_history_trades`

### Request Parameters
| Parameter   | Type   | Required | Description |
|-------------|--------|----------|-------------|
| symbol      | string | false    | Trading Pair |
| orderId     | string | false    | Order ID |
| positionId  | string | false    | Position ID |
| startTime   | int64  | false    | Start-Timestamp, Unix ms, z.B. 1597026383085 |
| endTime     | int64  | false    | End-Timestamp, Unix ms, z.B. 1597026683085 |
| skip        | int64  | false    | Anzahl übersprungener Orders, Default: 0 |
| limit       | int64  | false    | Max. Abfragen: 100, Default: 10 |

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
| tradeList         | list    | Trade-Liste |
| > tradeId         | string  | Trade ID |
| > orderId         | string  | Order ID |
| > symbol          | string  | Trading Pair |
| > qty             | string  | Menge (Base-Coin) |
| > positionMode    | string  | `ONE_WAY` oder `HEDGE` |
| > marginMode      | string  | `ISOLATION` oder `CROSS` |
| > leverage        | int     | Leverage |
| > price           | string  | Orderpreis (erforderlich bei `LIMIT`) |
| > side            | string  | `BUY` / `SELL` |
| > orderType       | string  | `LIMIT` / `MARKET` |
| > effect          | string  | Gültigkeitsdauer: `IOC`, `FOK`, `GTC` (Default), `POST_ONLY` |
| > clientId        | string  | Individuelle Order-ID |
| > reduceOnly      | boolean | Nur Positionsreduzierung |
| > fee             | string  | Gebühr |
| > realizedPNL     | string  | Realized PnL |
| > ctime           | int64   | Erstell-Timestamp |
| > roleType        | string  | `TAKER` oder `MAKER` |
| total             | int64   | Gesamtanzahl |

### Response Example
```json
{"code":0,"data":{"tradeList":[{"tradeId":"123","orderId":"11111","qty":"1","price":"60000","symbol":"BTCUSDT","positionMode":"HEDGE","marginMode":"ISOLATION","leverage":15,"fee":"0.01","realizedPNL":"1.78","type":"LIMIT","effect":"GTC","reduceOnly":false,"clientId":"22222","source":"api","ctime":1597026383085,"roleType":"TAKER"}],"total":10},"msg":"Success"}
```

---

## Get Order Detail

Quelle: https://www.bitunix.com/api-docs/futures/trade/get_order_detail.html

**Rate Limit**: 10 req/sec/uid

### Description
Ruft Order-Details ab.

### HTTP Request
`GET /api/v1/futures/trade/get_order_detail`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| orderId   | string | false    | Order ID. Mind. eines von `orderId`/`clientId` erforderlich |
| clientId  | string | false    | Client ID. Mind. eines von `orderId`/`clientId` erforderlich |

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
| qty           | string  | Menge (Base-Coin) |
| tradeQty      | string  | Ausgeführte Menge (Base-Coin) |
| positionMode  | string  | `ONE_WAY` oder `HEDGE` |
| marginMode    | string  | `ISOLATION` oder `CROSS` |
| leverage      | int     | Leverage |
| price         | string  | Orderpreis (erforderlich bei `LIMIT`) |
| side          | string  | `BUY` / `SELL` |
| orderType     | string  | `LIMIT` / `MARKET` |
| effect        | string  | Gültigkeitsdauer: `IOC`, `FOK`, `GTC` (Default), `POST_ONLY` |
| clientId      | string  | Individuelle Order-ID |
| reduceOnly    | boolean | Nur Positionsreduzierung |
| status        | string  | `INIT`, `NEW`, `PART_FILLED`, `CANCELED`, `FILLED` |
| fee           | string  | Gebühr |
| realizedPNL   | string  | Realized PnL |
| tpPrice       | string  | Take-Profit-Trigger-Preis |
| tpStopType    | string  | Take-Profit-Trigger-Typ: `MARK_PRICE` / `LAST_PRICE` |
| tpOrderType   | string  | Take-Profit-Order-Typ: `LIMIT` / `MARKET` |
| tpOrderPrice  | string  | Take-Profit-Order-Preis (erforderlich bei `LIMIT`) |
| slPrice       | string  | Stop-Loss-Trigger-Preis |
| slStopType    | string  | Stop-Loss-Trigger-Typ: `MARK_PRICE` / `LAST_PRICE` |
| slOrderType   | string  | Stop-Loss-Order-Typ: `LIMIT` / `MARKET` |
| slOrderPrice  | string  | Stop-Loss-Order-Preis (erforderlich bei `LIMIT`) |
| ctime         | int64   | Erstell-Timestamp |
| mtime         | int64   | Letzter Änderungs-Timestamp |

### Response Example
```json
{"code":0,"data":{"orderId":"11111","qty":"1","tradeQty":"0.5","price":"60000","symbol":"BTCUSDT","positionMode":"HEDGE","marginMode":"ISOLATION","leverage":15,"status":"PART_FILLED","fee":"0.01","realizedPNL":"1.78","type":"LIMIT","effect":"GTC","reduceOnly":false,"clientId":"22222","tpPrice":"61000","tpStopType":"MARK","tpOrderType":"LIMIT","tpOrderPrice":"61000.1","slPrice":"59000","slStopType":"MARK","slOrderType":"LIMIT","slOrderPrice":"59000.1","source":"api","ctime":1597026383085,"mtime":1597026383085},"msg":"Success"}
```

---

## Get Pending Orders

Quelle: https://www.bitunix.com/api-docs/futures/trade/get_pending_orders.html

**Rate Limit**: 10 req/sec/uid

### Description
Ruft offene (pending) Orders ab, sortiert nach Erstellzeit absteigend.

### HTTP Request
`GET /api/v1/futures/trade/get_pending_orders`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | false    | Trading Pair |
| orderId   | string | false    | Order ID |
| clientId  | string | false    | Client ID |
| status    | string | false    | Order-Status: `NEW` oder `PART_FILLED` |
| startTime | int64  | false    | Start-Timestamp, Unix ms, z.B. 1597026383085 |
| endTime   | int64  | false    | End-Timestamp, Unix ms, z.B. 1597026683085 |
| skip      | int64  | false    | Anzahl übersprungener Orders, Default: 0 |
| limit     | int64  | false    | Max. Abfragen: 100, Default: 10 |

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
Analog zu `Get History Orders` (siehe oben), Feld `orderList` mit denselben
Unterparametern.

### Response Example
```json
{"code":0,"data":{"orderList":[{"orderId":"11111","qty":"1","tradeQty":"0.5","price":"60000","symbol":"BTCUSDT","positionMode":"HEDGE","marginMode":"ISOLATION","leverage":15,"status":"NEW","fee":"0.01","realizedPNL":"1.78","type":"LIMIT","effect":"GTC","reduceOnly":false,"clientId":"22222","tpPrice":"61000","tpStopType":"MARK","tpOrderType":"LIMIT","tpOrderPrice":"61000.1","slPrice":"59000","slStopType":"MARK","slOrderType":"LIMIT","slOrderPrice":"59000.1","source":"api","ctime":1597026383085,"mtime":1597026383085}],"total":10},"msg":"Success"}
```

---

## Modify Order

Quelle: https://www.bitunix.com/api-docs/futures/trade/modify_order.html

**Rate Limit**: 10 req/sec/uid

### Description
Interface zur Ordermodifikation, um eine offene Order zu ändern (z.B. TP/SL
und/oder Preis/Menge).

### HTTP Request
`POST /api/v1/futures/trade/modify_order`

### Request Parameters
| Parameter      | Type   | Required | Description |
|----------------|--------|----------|-------------|
| orderId        | string | false    | Order ID. `orderId` oder `clientId` erforderlich. Bei beiden hat `orderId` Vorrang |
| clientId       | string | false    | Individuelle Order-ID. `orderId` oder `clientId` erforderlich. Bei beiden hat `orderId` Vorrang |
| qty            | string | true     | Menge (Base-Coin) |
| price          | string | true     | Orderpreis (erforderlich bei `LIMIT`) |
| tpPrice        | string | false    | Take-Profit-Trigger-Preis |
| tpStopType     | string | false    | Take-Profit-Trigger-Typ: `MARK_PRICE` / `LAST_PRICE` |
| tpOrderType    | string | false    | Take-Profit-Order-Typ: `LIMIT` / `MARKET` |
| tpOrderPrice   | string | false    | Take-Profit-Order-Preis (erforderlich bei `LIMIT`) |
| slPrice        | string | false    | Stop-Loss-Trigger-Preis |
| slStopType     | string | false    | Stop-Loss-Trigger-Typ: `MARK_PRICE` / `LAST_PRICE` |
| slOrderType    | string | false    | Stop-Loss-Order-Typ: `LIMIT` / `MARKET` |
| slOrderPrice   | string | false    | Stop-Loss-Order-Preis (erforderlich bei `LIMIT`) |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/trade/modify_order' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"orderId":"1111","symbol":"BTCUSDT","price":"60000","qty":"0.5","tpPrice":"61000","tpStopType":"MARK","tpOrderType":"LIMIT","tpOrderPrice":"61000.1"}'
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

Quelle: https://www.bitunix.com/api-docs/futures/trade/place_order.html

**Rate Limit**: 10 req/sec/uid

### Description
Platziert eine Order.

### HTTP Request
`POST /api/v1/futures/trade/place_order`

### Request Parameters
| Parameter      | Type    | Required | Description |
|----------------|---------|----------|-------------|
| symbol         | string  | true     | Trading Pair |
| qty            | string  | true     | Menge (Base-Coin) |
| price          | string  | false    | Orderpreis (erforderlich bei `LIMIT`) |
| side           | string  | true     | Order-Richtung: `BUY` / `SELL` |
| tradeSide      | string  | true     | Nur im Hedge-Modus erforderlich. `OPEN`/`CLOSE`. Open Long: side=`BUY`, tradeSide=`OPEN`. Open Short: side=`SELL`, tradeSide=`OPEN`. Close Long: side=`BUY`, tradeSide=`CLOSE`. Close Short: side=`SELL`, tradeSide=`CLOSE` |
| positionId     | string  | false    | Position ID. Erforderlich, wenn `tradeSide` = `CLOSE` |
| orderType      | string  | true     | Ordertyp: `LIMIT` / `MARKET` |
| effect         | string  | false    | Gültigkeitsdauer, erforderlich bei `LIMIT`: `IOC`, `FOK`, `GTC` (Default), `POST_ONLY` |
| clientId       | string  | false    | Individuelle Order-ID |
| reduceOnly     | boolean | false    | Nur Positionsreduzierung |
| tpPrice        | string  | false    | Take-Profit-Trigger-Preis |
| tpStopType     | string  | false    | Take-Profit-Trigger-Typ: `MARK_PRICE` / `LAST_PRICE` |
| tpOrderType    | string  | false    | Take-Profit-Order-Typ: `LIMIT` / `MARKET` |
| tpOrderPrice   | string  | false    | Take-Profit-Order-Preis (erforderlich bei `LIMIT`) |
| slPrice        | string  | false    | Stop-Loss-Trigger-Preis |
| slStopType     | string  | false    | Stop-Loss-Trigger-Typ: `MARK_PRICE` / `LAST_PRICE` |
| slOrderType    | string  | false    | Stop-Loss-Order-Typ: `LIMIT` / `MARKET` |
| slOrderPrice   | string  | false    | Stop-Loss-Order-Preis (erforderlich bei `LIMIT`) |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/trade/place_order' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"symbol":"BTCUSDT","side":"BUY","price":"60000","qty":"0.5","positionId":"111","tradeSide":"CLOSE","orderType":"LIMIT","reduceOnly":false,"effect":"GTC","clientId":"1110000aaa","tpPrice":"61000","tpStopType":"MARK","tpOrderType":"LIMIT","tpOrderPrice":"61000.1"}'
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
