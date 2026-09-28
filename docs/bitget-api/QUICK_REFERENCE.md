# Bitget Classic Futures API - Quick Reference

> ⚠️ **Cachy currently calls the decommissioned V1 API.** 9 of its 10 REST call
> shapes use `/api/mix/v1/…` paths and answer `30032`. This cheat sheet
> documents the **live V2** surface, because that is what a new integration
> should be written against. `09_v1_vs_v2.md` has the delta and the hazard.

---

## Base URL

| | |
|---|---|
| REST | `https://api.bitget.com` |
| WebSocket (public) | `wss://ws.bitget.com/v2/ws/public` |
| WebSocket (private) | `wss://ws.bitget.com/v2/ws/private` |
| VIP line REST | `https://vip-api.bitget.com` |

---

## Authentication Headers

Every signed REST request:

```
ACCESS-KEY        API key
ACCESS-SIGN       Base64(HMAC-SHA256(prehash, secretKey))
ACCESS-TIMESTAMP  milliseconds since epoch
ACCESS-PASSPHRASE set at key creation — unrecoverable if lost
Content-Type      application/json  (POST)
```

No `recvWindow`. No `nonce`. Timestamp must be within **30 s** of server time.

---

## Signature Generation

```js
const preHash = timestamp + method.toUpperCase() + requestPath + "?" + queryString + body;
const sign = base64(HMAC_SHA256(secretKey, preHash));
```

Omit `?queryString` when the query is empty.

Two traps:

- **REST timestamps are milliseconds; WebSocket login timestamps are seconds.**
  Same HMAC, different unit. The WebSocket docs contradict themselves here —
  the prose says milliseconds, the Java sample and the wire example say
  seconds. Seconds is correct.
- **The docs say to sort query parameters alphabetically. Unresolved whether
  that is required.** See `01_sign.md`. Assume sorted until a sandbox says
  otherwise.

---

## Core Endpoints

| Action | Method | Endpoint |
|---|---|---|
| Place order | POST | `/api/v2/mix/order/place-order` |
| Cancel order | POST | `/api/v2/mix/order/cancel-order` |
| Cancel all orders | POST | `/api/v2/mix/order/cancel-all-orders` |
| Flash close position | POST | `/api/v2/mix/order/close-positions` |
| Order detail | GET | `/api/v2/mix/order/detail` |
| Pending orders | GET | `/api/v2/mix/order/orders-pending` |
| Order history | GET | `/api/v2/mix/order/orders-history` |
| Order fills | GET | `/api/v2/mix/order/fills` |
| Account / balance | GET | `/api/v2/mix/account/account` |
| All positions | GET | `/api/v2/mix/position/all-position` |
| Set leverage | POST | `/api/v2/mix/account/set-leverage` |
| Set margin mode | POST | `/api/v2/mix/account/set-margin-mode` |
| Set position mode | POST | `/api/v2/mix/account/set-position-mode` |
| Liquidation price | GET | `/api/v2/mix/account/liq-price` |
| Attach TP/SL on entry | POST | `/api/v2/mix/order/place-order` + `presetStop*` |
| Trigger / trailing order | POST | `/api/v2/mix/order/place-plan-order` |
| Position TP/SL | POST | `/api/v2/mix/order/place-pos-tpsl` |
| Ticker | GET | `/api/v2/mix/market/ticker` |
| Candles | GET | `/api/v2/mix/market/candles` |
| Contract config | GET | `/api/v2/mix/market/contracts` |

---

## Order Schema

`side` carries **position direction** in V2, not transaction direction. Open
versus close is `tradeSide`.

| Mode | Request | Operation |
|---|---|---|
| One-way | `side: buy` / `sell`, `tradeSide` ignored | buy / sell |
| Hedge | `side: buy; tradeSide: open` | open long |
| Hedge | `side: sell; tradeSide: open` | open short |
| Hedge | `side: buy; tradeSide: close` | **close long** |
| Hedge | `side: sell; tradeSide: close` | **close short** |

**Closing a long is `side: buy` on Classic.** UTA inverts this — closing a long
is `side: sell` there. Do not carry a shared `side` normaliser across both.

In one-way mode a close cannot be expressed as open-vs-close at all, since
`tradeSide` is ignored; it needs `reduceOnly: YES` with the transaction
direction in `side`.

---

## Place Order Example

```http
POST /api/v2/mix/order/place-order
ACCESS-KEY: …
ACCESS-SIGN: …
ACCESS-TIMESTAMP: 1695806875837
ACCESS-PASSPHRASE: …
Content-Type: application/json
```

```json
{
  "symbol": "BTCUSDT",
  "productType": "USDT-FUTURES",
  "marginMode": "crossed",
  "marginCoin": "USDT",
  "side": "buy",
  "tradeSide": "open",
  "orderType": "limit",
  "price": "50000",
  "size": "0.1",
  "force": "gtc",
  "clientOid": "cachy-1234"
}
```

`productType` and `marginMode` are both **required**. `force` is one of
`ioc`, `fok`, `gtc`, `post_only` (default `gtc`). The V1 field `timInForceValue`
and the value `normal` do not exist in V2.

Response: `{"code": "00000", "data": {"orderId": "…", "clientOid": "…"}}`

---

## Response Envelope

```json
{ "code": "00000", "msg": "success", "requestTime": 1695806875837, "data": {} }
```

**`"00000"` is success, and a business failure arrives as HTTP 200.** Branch on
`code`, never on the HTTP status alone.

---

## Rate Limits

| Scope | Limit |
|---|---|
| Per endpoint | Printed on each page — mostly 10/s per UID, 20/s per IP for market data |
| Flash close | **1/s per UID** — tightest in the surface |
| Public market data | 20 requests/second, unified |
| Overall | 6,000 per IP per minute, 5-minute recovery after tripping |
| VIP 1 / 2 / 3–7 | 60/s · 80/s · 100/s |

Per-endpoint numbers are Default-tier floors. Rate limits scale with VIP level.

---

## Critical Error Codes

| Code | Meaning |
|---|---|
| `00000` | Success |
| `30032` | V1 API decommissioned |
| `400172` | Parameter verification failed |
| `30005` | WebSocket login failure |
| `22067` | Operations prohibited during ADL processing |
| `45001` / `40725` / `40808` | Transient, during the Tue–Thu 14:00–17:00 UTC+8 release window — retry |
| `401` | Invalid API key |
| `429` | Rate limited |

Bitget publishes **no error code table** for Classic. Branch on `00000` and
treat everything else as failure.

---

## WebSocket

```js
// login
sign = Base64(HmacSHA256(timestampSeconds + "GET" + "/user/verify", secretKey))
{ op: "login", args: [{ apiKey, passphrase, timestamp, sign }] }

// subscribe
{ op: "subscribe", args: [{ instType: "USDT-FUTURES", channel: "ticker", instId: "BTCUSDT" }] }
```

- Send the literal string `ping` every ~30 s, expect literal `pong`.
- Disconnected after 2 min without a `ping`, and **force-disconnected every 24 h** — implement reconnect.
- 10 messages/second; 300 connections per IP per 5 min, 100 max.
- 240 subscriptions/hour/connection; 1000 channels max, but fewer than 50 is recommended.
- Private channels need `login` first, on the private endpoint, and use `instId: "default"`.

---

**Full docs:** [`README.md`](README.md)
