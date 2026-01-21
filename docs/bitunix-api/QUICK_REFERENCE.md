# Bitunix API - Quick Reference

**⚡ Schnellreferenz für Entwickler**

---

## Base URL

```
https://fapi.bitunix.com
```

## Authentication Headers

```typescript
{
  "api-key": apiKey,
  "nonce": randomString(32),
  "timestamp": Date.now().toString(),
  "sign": signature,
  "Content-Type": "application/json"
}
```

## Signature Generation (JavaScript)

```javascript
const digest = SHA256(nonce + timestamp + apiKey + bodyString);
const sign = SHA256(digest + secretKey);
```

---

## Core Endpoints

| Action       | Method | Endpoint                                   |
| ------------ | ------ | ------------------------------------------ |
| Place Order  | POST   | `/api/v1/futures/trade/place_order`        |
| Cancel Order | POST   | `/api/v1/futures/trade/cancel_orders`      |
| Cancel All   | POST   | `/api/v1/futures/trade/cancel_all_orders`  |
| Modify Order | POST   | `/api/v1/futures/trade/modify_order`       |
| Get Pending  | GET    | `/api/v1/futures/trade/get_pending_orders` |
| Order Detail | GET    | `/api/v1/futures/trade/get_order_detail`   |
| Batch Order  | POST   | `/api/v1/futures/trade/batch_order`        |

---

## Rate Limits

- Place Order: **10/sec**
- Cancel Order: **20/sec**
- Get Pending: **10/sec**

---

## Critical Error Codes

- `20003` - Insufficient balance
- `20005` - Invalid leverage
- `30001` - Order would liquidate
- `30013` - Max orders exceeded
- `30018` - Reduce-only conflict

---

## Place Order Example

```typescript
POST /api/v1/futures/trade/place_order
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "orderType": "LIMIT",
  "qty": 0.01,
  "price": 50000,
  "effect": "GTC"
}
```

---

**Full Docs:** `README.md`
