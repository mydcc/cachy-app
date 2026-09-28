# Account Endpoints

All endpoints are **private** interfaces and require a signature (see `01_sign.md`).

---

## Adjust Position Margin

Source: https://www.bitunix.com/api-docs/futures/account/adjust_position_margin.html

**Rate Limit**: 5 req/sec/uid

### Description
Add or reduce margin (only for isolated margin mode).

### HTTP Request
`POST /api/v1/futures/account/adjust_position_margin`

### Request Parameters
| Parameter    | Type   | Required | Description |
|--------------|--------|----------|-------------|
| symbol       | string | true     | Trading pair |
| marginCoin   | string | true     | Margin coin |
| amount       | string | true     | Margin amount, positive = increase, negative = reduce |
| side         | string | false    | Position side `LONG`/`SHORT`. Either `side` or `positionId` is required |
| positionId   | string | false    | Position ID. Either `side` or `positionId` is required |

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
None (N/A)

### Response Example
```json
{"code":0,"data":"","msg":"Success"}
```

---

## Change Leverage

Source: https://www.bitunix.com/api-docs/futures/account/change_leverage.html

**Rate Limit**: 10 req/sec/uid

### Description
Adjusts the leverage for the specified symbol.

### HTTP Request
`POST /api/v1/futures/account/change_leverage`

### Request Parameters
| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| marginCoin | string | true     | Margin coin |
| symbol     | string | true     | Trading pair |
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
| marginCoin | string | Margin coin |
| symbol     | string | Trading pair |
| leverage   | int    | Leverage |

### Response Example
```json
{"code":0,"data":[{"marginCoin":"USDT","leverage":12,"symbol":"BTCUSDT"}],"msg":"Success"}
```

---

## Change Margin Mode

Source: https://www.bitunix.com/api-docs/futures/account/change_margin_mode.html

**Rate Limit**: 10 req/sec/uid

### Description
This interface cannot be used when the user has an open position or order.

### HTTP Request
`POST /api/v1/futures/account/change_margin_mode`

### Request Parameters
| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| marginMode | string | true     | Margin mode: `ISOLATION` / `CROSS` |
| symbol     | string | true     | Trading pair |
| marginCoin | string | true     | Margin coin |

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
| marginMode | string | Margin mode: `ISOLATION` / `CROSS` |
| symbol     | string | Trading pair |
| marginCoin | string | Margin coin |

### Response Example
```json
{"code":0,"data":[{"marginMode":"ISOLATION"}],"msg":"Success"}
```

---

## Change Position Mode

Source: https://www.bitunix.com/api-docs/futures/account/change_position_mode.html

**Rate Limit**: 10 req/sec/uid

### Description
Adjusts the position mode between "One Way Mode" and "Hedge Mode".

If the user's position mode is to be changed for all symbol contracts, hedge mode
or one-way mode must be specified.

> **Note**: The position mode cannot be changed when an open position/order
> exists under the product type. With positions or orders on either side of any
> trading pair within the respective product type, the request may fail.

### HTTP Request
`POST /api/v1/futures/account/change_position_mode`

### Request Parameters
| Parameter    | Type   | Required | Description |
|--------------|--------|----------|-------------|
| positionMode | string | true     | Position mode: `ONE_WAY` / `HEDGE` |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/futures/account/change_position_mode' \
-H "api-key:*******" \
-H "sign:*" \
-H "nonce:your-nonce" \
-H "timestamp:1659076670000" \
-H "language:en-US" \
-H "Content-Type: application/json" \
--data '{"positionMode":"HEDGE"}'
```

### Response Parameters
| Parameter    | Type   | Description |
|--------------|--------|-------------|
| positionMode | string | Position mode: `ONE_WAY` / `HEDGE` |

### Response Example
```json
{"code":0,"data":[{"positionMode":"HEDGE"}],"msg":"Success"}
```

---

## Get Leverage and Margin Mode

Source: https://www.bitunix.com/api-docs/futures/account/get_leverage_and_margin_mode.html

**Rate Limit**: 10 req/sec/uid

### Description
Retrieves leverage and margin mode.

### HTTP Request
`GET /api/v1/futures/account/get_leverage_margin_mode`

### Request Parameters
| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| symbol     | string | true     | Trading pair |
| marginCoin | string | true     | Margin coin |

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
| symbol     | string | Trading pair |
| marginCoin | string | Margin coin |
| leverage   | int    | Leverage |
| marginMode | string | `ISOLATION` or `CROSS` |

### Response Example
```json
{"code":0,"data":{"symbol":"BTCUSDT","marginCoin":"USDT","leverage":10,"marginMode":"ISOLATION"},"msg":"Success"}
```

---

## Get Position Mode

Source: https://www.bitunix.com/api-docs/futures/account/get_position_mode.html

**Rate Limit**: 20 req/sec/uid

### Description
Get the user's futures position mode (one-way or hedge).

### HTTP Request
`GET /api/v1/futures/account/position_mode`

> ⚠️ The page filename says `get_position_mode`, but the endpoint path is
> `position_mode` — no `get_` prefix. The same asymmetry exists one page over:
> the filename is `get_leverage_and_margin_mode` while the path is
> `get_leverage_margin_mode`. Doc filenames and API paths do not reliably match
> on this site.

### Request Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| None     | \-   | No       | No query parameters |

### Request Example
```bash
curl -X 'GET'  --location 'https://fapi.bitunix.com/api/v1/futures/account/position_mode' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json"
```

### Response Parameters
| Parameter       | Type   | Description |
|-----------------|--------|-------------|
| code            | integer| Response code. `0` means success |
| msg             | string | Response message |
| data            | object | Response data object |
| data.positionMode | string | Position mode<br>**ONE_WAY**: one-way position mode<br>**HEDGE**: hedge (dual-side) position mode |

### Response Example
```json
{"code":0,"data":{"positionMode":"HEDGE"},"msg":"Success"}
```

> **Why this matters to Cachy.** The order schema differs by position mode —
> hedge mode carries a `positionSide`, one-way mode does not. Reading this one
> field tells a client which request shape to build. See `INTEGRATION_STATUS.md`.

---

## Get Single Account

Source: https://www.bitunix.com/api-docs/futures/account/get_single_account.html

**Rate Limit**: 10 req/sec/uid

### Description
Retrieves the account details for the specified `marginCoin`.

### HTTP Request
`GET /api/v1/futures/account`

### Request Parameters
| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| marginCoin | string | true     | Margin coin |

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
| marginCoin               | string | Margin coin |
| available                 | string | Available amount in the account. This field + `crossUnrealizedPNL` = actual max. open amount |
| frozen                    | string | Frozen amount due to orders |
| margin                    | string | Frozen amount due to positions |
| transfer                  | string | Maximum transferable amount |
| positionMode              | string | Position mode: `ONE_WAY` / `HEDGE` |
| crossUnrealizedPNL        | string | Unrealised PnL for cross positions |
| isolationUnrealizedPNL    | string | Unrealised PnL for isolated positions |
| bonus                     | string | Futures bonus |

### Response Example
```json
{"code":0,"data":[{"marginCoin":"USDT","available":"1000","frozen":"0","margin":"10","transfer":"1000","positionMode":"HEDGE","crossUnrealizedPNL":"2","isolationUnrealizedPNL":"0","bonus":"0"}],"msg":"Success"}
```

---

## Get Trading Settings

Source: https://www.bitunix.com/api-docs/futures/account/get_trading_settings.html

**Rate Limit**: 20 req/sec/uid

### Description
Get the user's futures trading settings (margin mode and leverage) by symbol.
If `symbols` is omitted, all configured trading settings for the user are
returned. If `symbols` is provided, settings for the specified symbols are
returned (comma-separated, case-insensitive, max 50 symbols).

### HTTP Request
`GET /api/v1/futures/account/trading_settings`

> ⚠️ Third naming asymmetry on this site: filename `get_trading_settings`,
> path `trading_settings` — no `get_` prefix, same as `position_mode` above.

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbols   | string | false    | Trading pair symbols, comma-separated (e.g. `BTCUSDT,ETHUSDT`). Case-insensitive. Max 50 symbols. If omitted, returns all user trading settings. |

### Request Example
```bash
curl -X 'GET'  --location 'https://fapi.bitunix.com/api/v1/futures/account/trading_settings?symbols=BTCUSDT,ETHUSDT' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json"
```

### Response Parameters
| Parameter        | Type   | Description |
|------------------|--------|-------------|
| code             | integer| Response code. `0` means success |
| msg              | string | Response message |
| data             | list   | Trading settings list |
| data.symbol      | string | Trading pair symbol |
| data.marginCoin  | string | Margin coin (settlement coin) |
| data.marginMode  | string | Margin mode<br>**CROSS**: cross margin<br>**ISOLATION**: isolated margin |
| data.leverage    | int    | Leverage (legacy / one-way field) |
| data.longLeverage  | int  | Long leverage in hedge mode |
| data.shortLeverage | int  | Short leverage in hedge mode |

### Response Example
```json
{"code":0,"data":[{"symbol":"BTCUSDT","marginCoin":"USDT","marginMode":"CROSS","leverage":20,"longLeverage":20,"shortLeverage":20},{"symbol":"ETHUSDT","marginCoin":"USDT","marginMode":"ISOLATION","leverage":10,"longLeverage":10,"shortLeverage":10}],"msg":"Success"}
```

> **Why this matters to Cachy.** This is the only documented Bitunix endpoint
> that returns leverage for **several symbols in one call** — `Get Leverage and
> Margin Mode` takes exactly one `symbol`, so a watchlist of ten symbols costs
> ten requests against a 10 req/sec limit. This endpoint costs one.
>
> It also carries `longLeverage` / `shortLeverage` separately, which matters
> only in hedge mode; in one-way mode `leverage` is the field to read.
