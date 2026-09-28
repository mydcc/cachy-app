# Position Endpoints

`Get History Positions` and `Get Pending Positions` are **private** interfaces
(signature required). `Get Position Tiers` is **public**.

---

## Get History Positions

Source: https://www.bitunix.com/api-docs/futures/position/get_history_positions.html

**Rate Limit**: 10 req/sec/uid

### Description
Retrieves historical positions.

### HTTP Request
`GET /api/v1/futures/position/get_history_positions`

### Request Parameters
| Parameter     | Type   | Required | Description |
|---------------|--------|----------|-------------|
| symbol        | string | false    | Trading pair |
| positionId    | string | false    | Position ID |
| startTime     | int64  | false    | Start timestamp (position creation time), Unix ms, e.g. 1597026383085 |
| endTime       | int64  | false    | End timestamp (position creation time), Unix ms, e.g. 1597026683085 |
| skip          | int64  | false    | Number of skipped orders, Default: 0 |
| limit         | int64  | false    | Max. queries: 100, Default: 10 |
| subAccountId  | int64  | false    | With `subAccountId`: only the positions of that sub-account. Without: the positions of the main account |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/position/get_history_positions?symbol=BTCUSDT' \
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
| positionList    | list   | Position list |
| > positionId    | string | Position ID |
| > symbol        | string | Trading pair |
| > maxQty        | string | Maximum position quantity |
| > entryPrice    | string | Average entry price |
| > closePrice    | string | Average close price |
| > liqQty        | string | Liquidation quantity |
| > side          | string | `LONG` / `SHORT` |
| > marginMode    | string | `ISOLATION` / `CROSS` |
| > positionMode  | string | `ONE_WAY` / `HEDGE` |
| > leverage      | int32  | Leverage |
| > fee           | string | Trading fees deducted during the position |
| > funding       | string | Total funding fee during the position |
| > realizedPNL   | string | Realised PnL (excl. funding fee and trading fee) |
| > liqPrice      | string | Estimated liquidation price. `<= 0` means low risk, no liquidation price |
| > ctime         | int64  | Creation timestamp |
| > mtime         | int64  | Last modification timestamp |
| > subAccountId  | int64  | Position account ID |
| total           | int64  | Total count |

### Response Example
```json
{"code":0,"data":{"positionList":[{"positionId":"12345678","symbol":"BTCUSDT","maxQty":"0.5","entryPrice":"60000","closePrice":"61000","liqQty":"0","side":"LONG","positionMode":"HEDGE","marginMode":"ISOLATION","leverage":100,"fee":"0.1","funding":"-0.2","realizedPNL":"102.9","liqPrice":"22209","ctime":1691382137448,"mtime":1691382137448}],"total":12},"msg":"Success"}
```

---

## Get Pending Positions

Source: https://www.bitunix.com/api-docs/futures/position/get_pending_positions.html

**Rate Limit**: 10 req/sec/uid

### Description
Retrieves open (pending) positions.

### HTTP Request
`GET /api/v1/futures/position/get_pending_positions`

### Request Parameters
| Parameter           | Type   | Required | Description |
|---------------------|--------|----------|-------------|
| symbol              | string | false    | Trading pair |
| positionId          | string | false    | Position ID |
| subAccountId        | int64  | false    | With `subAccountId`: only the positions of that sub-account. Without: the positions of the main account + of all sub-accounts the current API key has access to |
| includeSubAccounts  | bool   | false    | Enable/disable sub-account querying (Cachy always queries the accessible scope; per-subaccount filtering is not exposed in the adapter) |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/position/get_pending_positions?symbol=BTCUSDT' \
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
| positionId      | string | Position ID |
| symbol          | string | Trading pair |
| qty             | string | Position quantity |
| entryValue      | string | Available amount for positions |
| side            | string | `LONG` / `SHORT` |
| marginMode      | string | `ISOLATION` / `CROSS` |
| positionMode    | string | `ONE_WAY` / `HEDGE` |
| leverage        | int32  | Leverage |
| fee             | string | Trading fees deducted during the position |
| funding         | string | Total funding fee during the position |
| realizedPNL     | string | Realised PnL (excl. funding fee and trading fee) |
| margin          | string | Frozen amount of the position |
| unrealizedPNL   | string | Unrealised PnL |
| liqPrice        | string | Estimated liquidation price. `<= 0` means low risk, no liquidation price |
| marginRate      | string | Margin ratio |
| avgOpenPrice    | string | Average entry price |
| ctime           | int64  | Creation timestamp |
| mtime           | int64  | Last modification timestamp |
| subAccountId    | int64  | Position account ID |

### Response Example
```json
{"code":0,"data":[{"positionId":"12345678","symbol":"BTCUSDT","qty":"0.5","entryValue":"30000","side":"LONG","positionMode":"HEDGE","marginMode":"ISOLATION","leverage":100,"fee":"0.1","funding":"-0.2","realizedPNL":"102.9","margin":"300","unrealizedPNL":"1.5","liqPrice":"22209","marginRate":"0.01", "avgOpenPrice": "1.0","ctime":1691382137448,"mtime":1691382137448}],"msg":"Success"}
```

---

## Get Position Tiers

Source: https://www.bitunix.com/api-docs/futures/position/get_position_tiers.html

**Rate Limit**: 10 req/sec/ip

### Description
Retrieves the position tiers (margin levels).

### HTTP Request
`GET /api/v1/futures/position/get_position_tiers`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | true     | Trading pair |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/position/get_position_tiers?symbol=BTCUSDT'
```

### Response Parameters
| Parameter               | Type   | Description |
|--------------------------|--------|-------------|
| symbol                    | string | Trading pair |
| level                     | int32  | Level |
| startValue                | string | Minimum value |
| endValue                  | string | Maximum value |
| leverage                  | int32  | Leverage |
| maintenanceMarginRate     | string | Maintenance margin rate: the margin amount corresponds to the position quantity level. If the margin rate of a position falls below the maintenance margin rate, a forced partial or full liquidation is triggered |

### Response Example
```json
{"code":0,"data":[{"symbol":"BTCUSDT","level":1,"startValue":"0","endValue":"50000","leverage":125,"maintenanceMarginRate":"0.004"},{"symbol":"BTCUSDT","level":2,"startValue":"50000","endValue":"200000","leverage":100,"maintenanceMarginRate":"0.005"}],"msg":"Success"}
```
