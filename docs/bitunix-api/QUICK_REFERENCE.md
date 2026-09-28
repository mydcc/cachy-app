# Bitunix API - Quick Reference

**⚡ Quick reference for developers**

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
const digest = SHA256(nonce + timestamp + apiKey + queryParamsStr + bodyString);
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
| Funding Rate (batch) | GET | `/api/v1/futures/market/funding_rate/batch` |
| Funding Rate History | GET | `/api/v1/futures/market/get_funding_rate_history` |

> ### ⚠️ `fundingRate` — the two REST endpoints disagree, and this set records the disagreement
>
> Both pages document the field as a fraction (`"0.0005"` = 0.05%). Beyond that
> the documentation is silent and the two endpoints are not treated the same
> way in this repository:
>
> | | Batch | History |
> |---|---|---|
> | Vendor description | *"Current funding rates"* | *"Funding rate"* |
> | Vendor example value | `0.0005` | `-0.00001191` |
> | Unit as treated here | **percentage** — divided by 100 on ingestion | recorded elsewhere in this set as **already a fraction** |
> | Code evidence | Yes — see below | **None. Nothing in the repository consumes this endpoint.** |
>
> The batch side is settled: `fetchBitunixFundingRates` applies
> `entry.fundingRate.dividedBy(100)`, so the venue's value is a percentage and
> the division is deliberate.
>
> The history side is **not**. `04_market.md` marks that field as an
> already-a-fraction with a "do NOT divide" warning, which contradicts the
> "both" claim that stood here previously. Neither reading has code evidence,
> because no call site reads `get_funding_rate_history` at all. Treat the
> history endpoint's unit as unverified — check live wire data before trusting
> either note.

REST ingestion lives in `fetchBitunixFundingRates`
([src/services/api/marketData.ts:759](../../src/services/api/marketData.ts)).
The WebSocket `price` channel's `fr` field was normalised the same way, but
that path is now unused.

---

## Rate Limits

- Place Order: **10/sec/uid**
- Cancel Order (`cancel_orders`): **5/sec/uid**
- Cancel All (`cancel_all_orders`): **10/sec/uid**
- Get Pending: **10/sec**

---

## Critical Error Codes

- `20003` - Insufficient balance
- `20005` - Invalid leverage
- `30001` - Order would liquidate
- `30013` - Max orders exceeded
- `30018` - Reduce-only conflict
- `30042` - Client ID duplicate (Cachy mints `clientId` per attempt)

---

## Place Order Example

```typescript
POST /api/v1/futures/trade/place_order
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "orderType": "LIMIT",
  "qty": "0.01",
  "price": "50000",
  "effect": "GTC"
}
```

---

**Full Docs:** `README.md`
