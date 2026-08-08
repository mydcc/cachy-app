# Account Endpoints

Alle Endpunkte sind **private** Interfaces und erfordern Signatur (siehe `01_sign.md`).

---

## Adjust Position Margin

Quelle: https://www.bitunix.com/api-docs/futures/account/adjust_position_margin.html

**Rate Limit**: 5 req/sec/uid

### Description
Margin hinzufügen oder reduzieren (nur für Isolated-Margin-Modus).

### HTTP Request
`POST /api/v1/futures/account/adjust_position_margin`

### Request Parameters
| Parameter    | Type   | Required | Description |
|--------------|--------|----------|-------------|
| symbol       | string | true     | Trading Pair |
| marginCoin   | string | true     | Margin Coin |
| amount       | string | true     | Margin-Betrag, positiv = erhöhen, negativ = reduzieren |
| side         | string | false    | Positions-Seite `LONG`/`SHORT`. Entweder `side` oder `positionId` erforderlich |
| positionId   | string | false    | Positions-ID. Entweder `side` oder `positionId` erforderlich |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/account/adjust_position_margin' \
-H "api-key:*******" \
-H "sign:*" \
-H "nonce:your-nonce" \
-H "timestamp:1659076670000" \
-H "language:en-US" \
-H "Content-Type: application/json" \
--data '{"symbol":"BTCUSDT","amount":"-100","marginCoin":"USDT","side":"LONG"}'
```

### Response Parameters
Keine (N/A)

### Response Example
```json
{"code":0,"data":"","msg":"Success"}
```

---

## Change Leverage

Quelle: https://www.bitunix.com/api-docs/futures/account/change_leverage.html

**Rate Limit**: 10 req/sec/uid

### Description
Passt den Leverage für das angegebene Symbol an.

### HTTP Request
`POST /api/v1/futures/account/change_leverage`

### Request Parameters
| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| marginCoin | string | true     | Margin Coin |
| symbol     | string | true     | Trading Pair |
| leverage   | int    | true     | Leverage |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/account/change_leverage' \
-H "api-key:*******" \
-H "sign:*" \
-H "nonce:your-nonce" \
-H "timestamp:1659076670000" \
-H "language:en-US" \
-H "Content-Type: application/json" \
--data '{"symbol":"BTCUSDT","leverage":12,"marginCoin":"USDT"}'
```

### Response Parameters
| Parameter  | Type   | Description |
|------------|--------|-------------|
| marginCoin | string | Margin Coin |
| symbol     | string | Trading Pair |
| leverage   | int    | Leverage |

### Response Example
```json
{"code":0,"data":[{"marginCoin":"USDT","leverage":12,"symbol":"BTCUSDT"}],"msg":"Success"}
```

---

## Change Margin Mode

Quelle: https://www.bitunix.com/api-docs/futures/account/change_margin_mode.html

**Rate Limit**: 10 req/sec/uid

### Description
Dieses Interface kann nicht verwendet werden, wenn der User eine offene
Position oder Order hat.

### HTTP Request
`POST /api/v1/futures/account/change_margin_mode`

### Request Parameters
| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| marginMode | string | true     | Margin Mode: `ISOLATION` / `CROSS` |
| symbol     | string | true     | Trading Pair |
| marginCoin | string | true     | Margin Coin |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/account/change_margin_mode' \
-H "api-key:*******" \
-H "sign:*" \
-H "nonce:your-nonce" \
-H "timestamp:1659076670000" \
-H "language:en-US" \
-H "Content-Type: application/json" \
--data '{"marginMode":"ISOLATION","symbol":"BTCUSDT","marginCoin":"USDT"}'
```

### Response Parameters
| Parameter  | Type   | Description |
|------------|--------|-------------|
| marginMode | string | Margin Mode: `ISOLATION` / `CROSS` |
| symbol     | string | Trading Pair |
| marginCoin | string | Margin Coin |

### Response Example
```json
{"code":0,"data":[{"positionMode":"ISOLATION"}],"msg":"Success"}
```

---

## Change Position Mode

Quelle: https://www.bitunix.com/api-docs/futures/account/change_position_mode.html

**Rate Limit**: 10 req/sec/uid

### Description
Passt den Positionsmodus zwischen "One Way Mode" und "Hedge Mode" an.

Wenn der Positionsmodus des Nutzers für alle Symbol-Kontrakte geändert werden
soll, muss der Hedge-Modus oder One-Way-Modus angegeben werden.

> **Hinweis**: Der Positionsmodus kann nicht angepasst werden, wenn eine
> offene Position/Order unter dem Product-Type existiert. Bei Positionen oder
> Orders auf irgendeiner Seite eines beliebigen Trading Pairs im jeweiligen
> Product-Type kann der Request fehlschlagen.

### HTTP Request
`POST /api/v1/futures/account/change_position_mode`

### Request Parameters
| Parameter    | Type   | Required | Description |
|--------------|--------|----------|-------------|
| positionMode | string | true     | Position Mode: `ONE_WAY` / `HEDGE` |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/account/change_position_mode' \
-H "api-key:*******" \
-H "sign:*" \
-H "nonce:your-nonce" \
-H "time:1659076670000" \
-H "language:en-US" \
-H "Content-Type: application/json" \
--data '{"positionMode":"HEDGE"}'
```

### Response Parameters
| Parameter    | Type   | Description |
|--------------|--------|-------------|
| positionMode | string | Position Mode: `ONE_WAY` / `HEDGE` |

### Response Example
```json
{"code":0,"data":[{"positionMode":"HEDGE"}],"msg":"Success"}
```

---

## Get Leverage and Margin Mode

Quelle: https://www.bitunix.com/api-docs/futures/account/get_leverage_and_margin_mode.html

**Rate Limit**: 10 req/sec/uid

### Description
Ruft Leverage und Margin Mode ab.

### HTTP Request
`GET /api/v1/futures/account/get_leverage_margin_mode`

### Request Parameters
| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| symbol     | string | true     | Trading Pair |
| marginCoin | string | true     | Margin Coin |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/account/get_leverage_margin_mode?symbol=BTCUSDT&marginCoin=USDT' \
-H "api-key:*******" \
-H "sign:*" \
-H "nonce:your-nonce" \
-H "timestamp:1659076670000" \
-H "language:en-US" \
-H "Content-Type: application/json"
```

### Response Parameters
| Parameter  | Type   | Description |
|------------|--------|-------------|
| symbol     | string | Trading Pair |
| marginCoin | string | Margin Coin |
| leverage   | int    | Leverage |
| marginMode | string | `ISOLATION` oder `CROSS` |

### Response Example
```json
{"code":0,"data":{"symbol":"BTCUSDT","marginCoin":"USDT","leverage":10,"marginMode":"ISOLATION"},"msg":"Success"}
```

---

## Get Single Account

Quelle: https://www.bitunix.com/api-docs/futures/account/get_single_account.html

**Rate Limit**: 10 req/sec/uid

### Description
Ruft Account-Details für den angegebenen `marginCoin` ab.

### HTTP Request
`GET /api/v1/futures/account`

### Request Parameters
| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| marginCoin | string | true     | Margin Coin |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/account?marginCoin=USDT' \
-H "api-key:*******" \
-H "sign:*" \
-H "nonce:your-nonce" \
-H "timestamp:1659076670000" \
-H "language:en-US" \
-H "Content-Type: application/json"
```

### Response Parameters
| Parameter               | Type   | Description |
|--------------------------|--------|-------------|
| marginCoin               | string | Margin Coin |
| available                 | string | Verfügbare Menge im Account. Dieses Feld + `crossUnrealizedPNL` = tatsächlich max. offener Betrag |
| frozen                    | string | Gesperrte Menge durch Orders |
| margin                    | string | Gesperrte Menge durch Positionen |
| transfer                  | string | Maximal transferierbarer Betrag |
| positionMode              | string | Position Mode: `ONE_WAY` / `HEDGE` |
| crossUnrealizedPNL        | string | Unrealized PnL für Cross-Positionen |
| isolationUnrealizedPNL    | string | Unrealized PnL für Isolation-Positionen |
| bonus                     | string | Futures Bonus |

### Response Example
```json
{"code":0,"data":[{"marginCoin":"USDT","available":"1000","frozen":"0","margin":"10","transfer":"1000","positionMode":"HEDGE","crossUnrealizedPNL":"2","isolationUnrealizedPNL":"0","bonus":"0"}],"msg":"Success"}
```
