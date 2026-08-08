# Position Endpoints

`Get History Positions` und `Get Pending Positions` sind **private** Interfaces
(Signatur erforderlich). `Get Position Tiers` ist **public**.

---

## Get History Positions

Quelle: https://www.bitunix.com/api-docs/futures/position/get_history_positions.html

**Rate Limit**: 10 req/sec/uid

### Description
Ruft historische Positionen ab.

### HTTP Request
`GET /api/v1/futures/position/get_history_positions`

### Request Parameters
| Parameter     | Type   | Required | Description |
|---------------|--------|----------|-------------|
| symbol        | string | false    | Trading Pair |
| positionId    | string | false    | Position ID |
| startTime     | int64  | false    | Start-Timestamp (Position-Erstellzeit), Unix ms, z.B. 1597026383085 |
| endTime       | int64  | false    | End-Timestamp (Position-Erstellzeit), Unix ms, z.B. 1597026683085 |
| skip          | int64  | false    | Anzahl übersprungener Orders, Default: 0 |
| limit         | int64  | false    | Max. Abfragen: 100, Default: 10 |
| subAccountId  | int64  | false    | Mit `subAccountId`: nur Positionen dieses Subaccounts. Ohne: Positionen des Hauptaccounts |

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
| positionList    | list   | Positionsliste |
| > positionId    | string | Position ID |
| > symbol        | string | Trading Pair |
| > maxQty        | string | Maximale Positionsmenge |
| > entryPrice    | string | Durchschnittlicher Einstiegspreis |
| > closePrice    | string | Durchschnittlicher Schließpreis |
| > liqQty        | string | Liquidations-Menge |
| > side          | string | `LONG` / `SHORT` |
| > marginMode    | string | `ISOLATION` / `CROSS` |
| > positionMode  | string | `ONE_WAY` / `HEDGE` |
| > leverage      | int32  | Leverage |
| > fee           | string | Abgezogene Handelsgebühren während der Position |
| > funding       | string | Gesamte Funding Fee während der Position |
| > realizedPNL   | string | Realized PnL (exkl. Funding Fee und Handelsgebühr) |
| > liqPrice      | string | Geschätzter Liquidationspreis. `<= 0` bedeutet niedriges Risiko, kein Liquidationspreis |
| > ctime         | int64  | Erstell-Timestamp |
| > mtime         | int64  | Letzter Änderungs-Timestamp |
| > subAccountId  | int64  | Positions-Account-ID |
| total           | int64  | Gesamtanzahl |

### Response Example
```json
{"code":0,"data":{"positionList":[{"positionId":"12345678","symbol":"BTCUSDT","maxQty":"0.5","entryPrice":"60000","closePrice":"61000","liqQty":"0","side":"LONG","positionMode":"HEDGE","marginMode":"ISOLATION","leverage":100,"fee":"0.1","funding":"-0.2","realizedPNL":"102.9","liqPrice":"22209","ctime":1691382137448,"mtime":1691382137448}],"total":12},"msg":"Success"}
```

---

## Get Pending Positions

Quelle: https://www.bitunix.com/api-docs/futures/position/get_pending_positions.html

**Rate Limit**: 10 req/sec/uid

### Description
Ruft offene (pending) Positionen ab.

### HTTP Request
`GET /api/v1/futures/position/get_pending_positions`

### Request Parameters
| Parameter           | Type   | Required | Description |
|---------------------|--------|----------|-------------|
| symbol              | string | false    | Trading Pair |
| positionId          | string | false    | Position ID |
| subAccountId        | int64  | false    | Mit `subAccountId`: nur Positionen dieses Subaccounts. Ohne: Positionen des Hauptaccounts + aller Subaccounts, auf die der aktuelle API-Key Zugriff hat |
| includeSubAccounts  | bool   | false    | Subaccount-Abfrage aktivieren/deaktivieren |

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
| symbol          | string | Trading Pair |
| qty             | string | Positionsmenge |
| entryValue      | string | Verfügbarer Betrag für Positionen |
| side            | string | `LONG` / `SHORT` |
| marginMode      | string | `ISOLATION` / `CROSS` |
| positionMode    | string | `ONE_WAY` / `HEDGE` |
| leverage        | int32  | Leverage |
| fee             | string | Abgezogene Handelsgebühren während der Position |
| funding         | string | Gesamte Funding Fee während der Position |
| realizedPNL     | string | Realized PnL (exkl. Funding Fee und Handelsgebühr) |
| margin          | string | Gesperrter Betrag der Position |
| unrealizedPNL   | string | Unrealized PnL |
| liqPrice        | string | Geschätzter Liquidationspreis. `<= 0` bedeutet niedriges Risiko, kein Liquidationspreis |
| marginRate      | string | Margin-Ratio |
| avgOpenPrice    | string | Durchschnittlicher Eröffnungspreis |
| ctime           | int64  | Erstell-Timestamp |
| mtime           | int64  | Letzter Änderungs-Timestamp |
| subAccountId    | int64  | Positions-Account-ID |

### Response Example
```json
{"code":0,"data":[{"positionId":"12345678","symbol":"BTCUSDT","qty":"0.5","entryValue":"30000","side":"LONG","positionMode":"HEDGE","marginMode":"ISOLATION","leverage":100,"fee":"0.1","funding":"-0.2","realizedPNL":"102.9","margin":"300","unrealizedPNL":"1.5","liqPrice":"22209","marginRate":"0.01", "avgOpenPrice": "1.0","ctime":1691382137448,"mtime":1691382137448}],"msg":"Success"}
```

---

## Get Position Tiers

Quelle: https://www.bitunix.com/api-docs/futures/position/get_position_tiers.html

**Rate Limit**: 10 req/sec/ip

### Description
Ruft die Position-Tiers (Margin-Stufen) ab.

### HTTP Request
`GET /api/v1/futures/position/get_position_tiers`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | true     | Trading Pair |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/position/get_position_tiers?symbol=BTCUSDT'
```

### Response Parameters
| Parameter               | Type   | Description |
|--------------------------|--------|-------------|
| symbol                    | string | Trading Pair |
| level                     | int32  | Stufe (Level) |
| startValue                | string | Minimalwert |
| endValue                  | string | Maximalwert |
| leverage                  | int32  | Leverage |
| maintenanceMarginRate     | string | Maintenance Margin Rate: Der Margin-Betrag entspricht der Positionsmengen-Stufe. Fällt die Margin-Rate einer Position unter die Maintenance Margin Rate, wird eine erzwungene Teil- oder Vollliquidation ausgelöst |

### Response Example
```json
{"code":0,"data":[{"symbol":"BTCUSDT","level":1,"startValue":"0","endValue":"50000","leverage":125,"maintenanceMarginRate":"0.004"},{"symbol":"BTCUSDT","level":2,"startValue":"50000","endValue":"200000","leverage":100,"maintenanceMarginRate":"0.005"}],"msg":"Success"}
```
