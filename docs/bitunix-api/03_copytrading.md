# CopyTrading – Asset Endpoints

All endpoints are **private** interfaces and require a signature (see `01_sign.md`).

---

## Asset Query

Source: https://www.bitunix.com/api-docs/futures/copyTrading/asset/asset_query.html

**Rate Limit**: 10 req/sec/uid

### Description
Interface for asset querying.

### HTTP Request
`GET /api/v1/cp/asset/query`

### Request Parameters
None.

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
| available    | string | Available futures funds |
| maxTransfer  | string | Maximum transferable amount |

### Response Example
```json
{"code":0,"msg":"result.success","data":{"available":"54.20916","maxTransfer":"52.20916"},"success":true}
```

---

## Transfer Asset from Main Account to Sub Account

Source: https://www.bitunix.com/api-docs/futures/copyTrading/asset/transfer_asset_from_main_account_to_sub_account.html

**Rate Limit**: 10 req/sec/uid

### Description
Interface for transferring assets from the main account to the sub-account.

### HTTP Request
`POST /api/v1/cp/asset/transfer-to-sub-account`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| amount    | string | true     | Transfer amount |
| assetType | string | true     | Assets are transferred from the main account's futures or spot account. e.g.: `FUTURES`/`SPOT` |

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
None.

### Response Example
```json
{"code":0,"msg":"result.success","data":"","success":true}
```

---

## Transfer Asset from Sub Account to Main Account

Source: https://www.bitunix.com/api-docs/futures/copyTrading/asset/transfer_asset_from_subaccount_to_main_account.html

**Rate Limit**: 10 req/sec/uid

### Description
Interface for transferring assets from the sub-account to the main account.

### HTTP Request
`POST /api/v1/cp/asset/transfer-to-main-account`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| amount    | string | true     | Transfer amount |
| assetType | string | true     | Assets are transferred to the main account's futures or spot account. e.g.: `SPOT`/`FUTURES` |

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
None.

### Response Example
```json
{"code":0,"msg":"result.success","data":"","success":true}
```
