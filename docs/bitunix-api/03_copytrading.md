# CopyTrading – Asset Endpoints

Alle Endpunkte sind **private** Interfaces und erfordern Signatur (siehe `01_sign.md`).

---

## Asset Query

Quelle: https://www.bitunix.com/api-docs/futures/copyTrading/asset/asset_query.html

**Rate Limit**: 10 req/sec/uid

### Description
Interface zur Asset-Abfrage.

### HTTP Request
`GET /api/v1/cp/asset/query`

### Request Parameters
Keine.

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/cp/asset/query' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "timestamp:1659076670000" \
   -H "nonce:your-nonce" \
   -H "language:en-US"
```

### Response Parameters
| Parameter    | Type   | Description |
|--------------|--------|-------------|
| available    | string | Verfügbare Futures-Mittel |
| maxTransfer  | string | Maximal transferierbarer Betrag |

### Response Example
```json
{"code":0,"msg":"result.success","data":{"available":"54.20916","maxTransfer":"52.20916"},"success":true}
```

---

## Transfer Asset from Main Account to Sub Account

Quelle: https://www.bitunix.com/api-docs/futures/copyTrading/asset/transfer_asset_from_main_account_to_sub_account.html

**Rate Limit**: 10 req/sec/uid

### Description
Interface zum Transfer von Assets vom Hauptaccount zum Subaccount.

### HTTP Request
`POST /api/v1/cp/asset/transfer-to-sub-account`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| amount    | string | true     | Transfer-Betrag |
| assetType | string | true     | Assets werden vom Futures- oder Spot-Account des Hauptaccounts transferiert. z.B.: `FUTURES`/`SPOT` |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/cp/asset/transfer-to-sub-account' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "nonce:your-nonce" \
   -H "timestamp:1659076670000" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"amount":"10","assetType":"SPOT"}'
```

### Response Parameters
Keine.

### Response Example
```json
{"code":0,"msg":"result.success","data":"","success":true}
```

---

## Transfer Asset from Sub Account to Main Account

Quelle: https://www.bitunix.com/api-docs/futures/copyTrading/asset/transfer_asset_from_subaccount_to_main_account.html

**Rate Limit**: 10 req/sec/uid

### Description
Interface zum Transfer von Assets vom Subaccount zum Hauptaccount.

### HTTP Request
`POST /api/v1/cp/asset/transfer-to-main-account`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| amount    | string | true     | Transfer-Betrag |
| assetType | string | true     | Assets werden zum Futures- oder Spot-Account des Hauptaccounts transferiert. z.B.: `SPOT`/`FUTURES` |

### Request Example
```bash
curl -X 'POST' --location 'https://fapi.bitunix.com/api/v1/cp/asset/transfer-to-main-account' \
   -H "api-key:*******" \
   -H "sign:*" \
   -H "timestamp:1659076670000" \
   -H "nonce:your-nonce" \
   -H "language:en-US" \
   -H "Content-Type: application/json" \
 --data '{"amount":"10","assetType":"SPOT"}'
```

### Response Parameters
Keine.

### Response Example
```json
{"code":0,"msg":"result.success","data":"","success":true}
```
