# Bitunix Futures OpenAPI – Dokumentation (Crawl)

<<<<<<< Updated upstream
**Base URL:** `https://fapi.bitunix.com`  
**Version:** Futures Trading API  
**Last Updated:** 2026-08-08
=======
Diese Dokumentation ist ein vollständiger Crawl der offiziellen Bitunix Futures
OpenAPI-Dokumentation unter:
>>>>>>> Stashed changes

- Quelle: https://www.bitunix.com/api-docs/futures/common/introduction.html
- Gecrawlt am: 08.08.2026
- Basis-Domain REST API: `https://fapi.bitunix.com`
- Basis-Domain WebSocket: `wss://fapi.bitunix.com/public/` (öffentlich) und
  `wss://fapi.bitunix.com/private/` (privat)
- Offizielles Demo-Repo: https://github.com/BitunixOfficial/open-api

## Dateiübersicht

| Datei | Inhalt |
|---|---|
| `00_common.md` | Einführung, Auth-Header, Interaktionsmodell, Standards |
| `01_sign.md` | REST- & WebSocket-Signaturverfahren (inkl. Go/Python-Code) |
| `02_account.md` | Account-Endpunkte (Leverage, Margin, Position Mode, Balance) |
| `03_copytrading.md` | CopyTrading Asset-Endpunkte (Sub-Account-Transfers) |
| `04_market.md` | Market-Daten (Depth, Funding Rate, Kline, Ticker, Trading Pairs) |
| `05_position.md` | Positions-Endpunkte (History, Pending, Tiers) |
| `06_tp_sl.md` | Take-Profit/Stop-Loss-Endpunkte |
| `07_trade.md` | Order-Endpunkte (Place, Modify, Cancel, Batch, History) |
| `08_websocket.md` | WebSocket-Verbindung, Login, alle Private- & Public-Channels |
| `09_error_codes.md` | Vollständige Fehlercode-Tabelle |
| `10_change_log.md` | Änderungsprotokoll der offiziellen Doku |

## Kurzüberblick über die API-Struktur

### Interface-Typen
- **Public**: Keine Authentifizierung nötig (Marktdaten, Konfiguration)
- **Private**: Erfordert Signatur via `api-key`, `nonce`, `timestamp`, `sign`

### Pflicht-Header für alle REST-Requests
| Header | Beschreibung |
|---|---|
| `api-key` | API-Key des Requests |
| `nonce` | Zufälliger 32-Bit-String |
| `timestamp` | Aktueller Timestamp in Millisekunden |
| `sign` | Signatur-String (siehe `01_sign.md`) |
| `Content-Type` | Immer `application/json` |

### Grundlegendes Signaturverfahren (REST)
```
digest = SHA256(nonce + timestamp + api-key + queryParams + body)
sign   = SHA256(digest + secretKey)
```

<<<<<<< Updated upstream
### Signature Algorithm

**Step 1: Prepare Data**

- Sort all query parameters alphabetically
- For POST body: use compressed JSON string (no spaces)

**Step 2: Generate Digest**

```javascript
digest = SHA256(
  nonce + timestamp + api - key + sorted_query_params + body_string,
);
```

**Step 3: Final Signature**

```javascript
sign = SHA256(digest + secretKey);
```

### Example (Node.js)

```javascript
const crypto = require("crypto");

function generateSignature(
  apiKey,
  secretKey,
  nonce,
  timestamp,
  method,
  path,
  body = "",
) {
  // Step 1: Prepare body string
  const bodyString = body ? JSON.stringify(body).replace(/\s/g, "") : "";

  // Step 2: Generate digest
  const digest = crypto
    .createHash("sha256")
    .update(nonce + timestamp + apiKey + bodyString)
    .digest("hex");

  // Step 3: Final signature
  const signature = crypto
    .createHash("sha256")
    .update(digest + secretKey)
    .digest("hex");

  return signature;
}
```

---

## Trade Endpoints

### 1. Place Order

**POST** `/api/v1/futures/trade/place_order`

**Description:** Place a new futures order (Market or Limit)

**Rate Limit:** 10 requests/second per UID

#### Request Body

```typescript
{
  symbol: string;          // "BTCUSDT" (required)
  side: "BUY" | "SELL";   // (required)
  orderType: "LIMIT" | "MARKET";  // (required)
  qty: number;            // Amount in base coin (required)
  price?: number;         // Required for LIMIT orders
  tradeSide?: "OPEN" | "CLOSE";  // Required in hedge mode
  effect?: "IOC" | "FOK" | "GTC" | "POST_ONLY";  // For LIMIT orders
  clientId?: string;      // Custom order ID
  reduceOnly?: boolean;   // Only reduce position

  // Take Profit (optional)
  tpPrice?: number;
  tpStopType?: "PRICE" | "MARK";
  tpOrderType?: "LIMIT" | "MARKET";
  tpOrderPrice?: number;

  // Stop Loss (optional)
  slPrice?: number;
  slStopType?: "PRICE" | "MARK";
  slOrderType?: "LIMIT" | "MARKET";
  slOrderPrice?: number;
}
```

#### Response

```typescript
{
  code: 0,  // 0 = success
  msg: "success",
  data: {
    orderId: string;
    symbol: string;
    side: "BUY" | "SELL";
    orderType: "LIMIT" | "MARKET";
    price: string;
    qty: string;
    filledQty: string;
    status: "NEW" | "FILLED" | "PARTIALLY_FILLED" | "CANCELED";
    createTime: number;  // milliseconds
  }
}
```

---

### 2. Cancel Order

**POST** `/api/v1/futures/trade/cancel_orders`

**Description:** Cancel single or multiple orders

#### Request Body

```typescript
{
  symbol: string;       // "BTCUSDT" (required)
  orderId?: string;     // Cancel specific order
  orderIds?: string[];  // Cancel multiple orders
  clientId?: string;    // Cancel by client ID
}
```

#### Response

```typescript
{
  code: 0,
  msg: "success",
  data: {
    success: string[];  // Successfully canceled order IDs
    failed: string[];   // Failed order IDs
  }
}
```

---

### 3. Cancel All Orders

**POST** `/api/v1/futures/trade/cancel_all_orders`

**Description:** Cancel all pending orders for a symbol or all symbols

#### Request Body

```typescript
{
  symbol?: string;  // Optional: specific symbol, omit for all
}
```

---

### 4. Modify Order

**POST** `/api/v1/futures/trade/modify_order`

**Description:** Modify an existing pending order

#### Request Body

```typescript
{
  symbol: string;      // (required)
  orderId: string;     // (required)
  qty?: number;        // New quantity
  price?: number;      // New price
}
```

---

### 5. Get Pending Orders

**GET** `/api/v1/futures/trade/get_pending_orders`

**Description:** Get all pending orders

#### Query Parameters

```typescript
{
  symbol?: string;     // Optional: filter by symbol
  page?: number;       // Default: 1
  pageSize?: number;   // Default: 20, Max: 100
}
```

#### Response

```typescript
{
  code: 0,
  data: {
    orders: [
      {
        orderId: string;
        symbol: string;
        side: "BUY" | "SELL";
        orderType: "LIMIT" | "MARKET";
        price: string;
        qty: string;
        filledQty: string;
        status: string;
        createTime: number;
      }
    ],
    total: number;
    page: number;
    pageSize: number;
  }
}
```

---

### 6. Get Order Detail

**GET** `/api/v1/futures/trade/get_order_detail`

**Description:** Get details of a specific order

#### Query Parameters

```typescript
{
  orderId?: string;    // Order ID
  clientId?: string;   // Or Client ID
}
```

---

### 7. Batch Order

**POST** `/api/v1/futures/trade/batch_order`

**Description:** Place multiple orders in a single request

**Max Orders:** 10 per batch

#### Request Body

```typescript
{
  orders: [
    {
      symbol: string;
      side: "BUY" | "SELL";
      orderType: "LIMIT" | "MARKET";
      qty: number;
      price?: number;
      // ... same as place_order
    }
  ]
}
```

---

## Error Codes

### Success

- **0** - Success

### Authentication Errors (10xxx)

- **10001** - Network Error
- **10002** - Parameter Error
- **10003** - api-key can't be empty
- **10004** - IP not in API key whitelist
- **10005** - Too many requests, please try again later
- **10006** - Request too frequently
- **10007** - Sign signature error
- **10008** - {value} does not comply with the rule

### Trading Errors (20xxx)

- **20001** - Market not exists
- **20002** - Position limit exceeded
- **20003** - **Insufficient balance**
- **20004** - Insufficient Trader
- **20005** - **Invalid leverage**
- **20006** - Can't change leverage with open orders
- **20007** - Order not found
- **20008** - Insufficient amount
- **20009** - Position exists, can't update mode
- **20010** - Coupon activation failed
- **20011** - Account not allowed to trade
- **20012** - Futures does not allow trading
- **20013** - Function disabled due to pending deletion
- **20014** - Account deleted
- **20015** - Futures not supported
- **20016** - Batch order exceeded max size

### Order Errors (30xxx)

- **30001** - **Order would liquidate** - Adjust price/leverage
- **30002** - Price below liquidation price (Long)
- **30003** - Price above liquidation price (Short)
- **30004** - Position not exist
- **30005** - Trigger price too close to current
- **30006** - Please select TP or SL
- **30007** - TP trigger price > entry (Long)
- **30008** - TP trigger price < entry (Short)
- **30009** - SL trigger price < entry (Long)
- **30010** - SL trigger price > entry (Short)
- **30011** - Abnormal order status
- **30012** - Already added to favorite
- **30013** - **Max orders exceeded**
- **30014** - Max Buy Order Price
- **30015** - Min Sell Order Price
- **30016** - Qty should be larger than minimum
- **30017** - Qty less than minimum
- **30018** - **Reduce-only conflict** - No position or wrong direction
- **30019** - Reduce-only same direction as position
- **30020-30033** - Various TP/SL validation errors

---

## Rate Limiting

### Trade Operations

- **Place Order:** 10 requests/second per UID
- **Cancel Order:** 20 requests/second per UID
- **Modify Order:** 10 requests/second per UID

### Account Operations

- **Get Balance:** 5 requests/second
- **Get Positions:** 10 requests/second

### Market Data (Public)

- **Get Ticker:** 20 requests/second
- **Get Depth:** 10 requests/second
- **Get Kline:** 20 requests/second

### Rate Limit Response

When rate limit is exceeded:

```json
{
  "code": 10006,
  "msg": "Request too frequently"
}
```

**Recommended Strategy:**

- Implement exponential backoff
- Use batch endpoints where possible
- Cache public data aggressively

---

## Request/Response Format

### Request Format

#### GET Requests

```
GET /api/v1/futures/trade/get_pending_orders?symbol=BTCUSDT&page=1
Headers: {
  "api-key": "...",
  "nonce": "...",
  "timestamp": "...",
  "sign": "..."
}
```

#### POST Requests

```
POST /api/v1/futures/trade/place_order
Headers: {
  "api-key": "...",
  "nonce": "...",
  "timestamp": "...",
  "sign": "...",
  "Content-Type": "application/json"
}
Body: {
  "symbol": "BTCUSDT",
  "side": "BUY",
  "orderType": "LIMIT",
  "qty": 0.01,
  "price": 50000
}
```

### Response Format

All responses follow this structure:

```typescript
{
  code: number;  // 0 = success, other = error
  msg: string;   // Success message or error description
  data?: any;    // Response payload (if applicable)
}
```

### Timestamp Format

- **All timestamps are in milliseconds**
- **UTC timezone**
- Example: `1705900800000` = `2024-01-22 00:00:00 UTC`

---

## Market Data - Funding Rate

Confirmed against the official docs (<https://www.bitunix.com/api-docs/futures/market/>) on 2026-08-08.
These are REST endpoints — distinct from the WS `price` channel's `fr` field (see
`src/services/bitunixWs.ts`), which is **not documented** on these pages and, per
live-traffic investigation, is scaled differently (already a percentage, not a
fraction — see `normalizeFundingRatePercent()` in that file).

### Get Funding Rate Batch

**GET** `/api/v1/futures/market/funding_rate/batch`

**Description:** Get the current funding rate of the contract(s).

**Rate Limit:** 10 req/sec/ip

Note: despite the doc page being named `get_funding_rate_batch.html`, the actual
HTTP path has no `get_` prefix and uses `funding_rate/batch`, not
`funding_rate_batch` — verified from the page's own request example.

#### Response

```typescript
{
  code: 0,
  data: [
    {
      symbol: string;          // "BTCUSDT"
      markPrice: string;       // decimal as string
      lastPrice: string;
      indexPrice: string;
      fundingRate: string;     // decimal AS A FRACTION, e.g. "0.0005" = 0.05%
      fundingInterval: number; // settlement interval in HOURS (varies per symbol, not fixed at 8h)
      nextFundingTime: string; // ms epoch
      maxFundingRate: string;  // fraction, e.g. "0.3"
      minFundingRate: string;  // fraction, e.g. "-0.3"
    }
  ],
  msg: "Success"
}
```

#### Response Example

```json
{
  "code": 0,
  "data": [
    {
      "symbol": "BTCUSDT",
      "markPrice": "60000",
      "lastPrice": "60001",
      "indexPrice": "60001",
      "fundingRate": "0.0005",
      "fundingInterval": 8,
      "nextFundingTime": "1770710400000",
      "maxFundingRate": "0.3",
      "minFundingRate": "-0.3"
    }
  ],
  "msg": "Success"
}
```

### Get Funding Rate History

**GET** `/api/v1/futures/market/get_funding_rate_history`

**Description:** Get the history funding rate of the contract.

**Rate Limit:** 10 req/sec/ip

#### Request Parameters

| Parameter | Type   | Required | Description                                                  |
| --------- | ------ | -------- | -------------------------------------------------------------- |
| symbol    | string | true     | Trading pair, e.g. `BTCUSDT`                                    |
| starTime  | int64  | false    | Start timestamp (funding settle time), ms epoch (sic, no `t`)  |
| endTime   | int64  | false    | End timestamp (funding settle time), ms epoch                  |
| limit     | int32  | false    | Default: 100, Maximum: 200                                      |

#### Response

```typescript
{
  code: 0,
  data: [
    {
      markPrice: string;
      fundingRate: string; // decimal AS A FRACTION, e.g. "-0.00001191"
      fundingTime: string; // ms epoch
    }
  ],
  msg: "Success"
}
```

### Get Funding Rate (single symbol)

**GET** `/api/v1/futures/market/get_funding_rate` (path unconfirmed — inferred from
sidebar link, not yet verified against the actual doc page content; likely mirrors
the batch endpoint's schema for a single symbol). **TODO:** confirm exact path and
schema before relying on it.

---

## WebSocket Support

For real-time data, Bitunix provides WebSocket endpoints:

**Base URL:** `wss://fapi.bitunix.com/ws`

### Topics

- **Private:** Orders, Positions, Balance (requires authentication)
- **Public:** Tickers, Depth, Trades, Klines, MarketPrice (includes an
  undocumented `fr` funding-rate field — see note above)

---

## Common Workflows

### Workflow 1: Place Limit Order

```javascript
// 1. Check balance
GET /api/v1/futures/account/balance

// 2. Get current price
GET /api/v1/futures/market/ticker?symbol=BTCUSDT

// 3. Place order
POST /api/v1/futures/trade/place_order
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "orderType": "LIMIT",
  "qty": 0.01,
  "price": 49500,
  "effect": "GTC"
}

// 4. Check order status
GET /api/v1/futures/trade/get_order_detail?orderId=...
```

### Workflow 2: Close Position

```javascript
// 1. Get current position
GET /api/v1/futures/position/get_positions?symbol=BTCUSDT

// 2. Place closing order (opposite side)
POST /api/v1/futures/trade/place_order
{
  "symbol": "BTCUSDT",
  "side": "SELL",  // Opposite of position
  "orderType": "MARKET",
  "qty": 0.01,
  "reduceOnly": true
}
```

---

## Notes & Best Practices

1. **Always use `reduceOnly: true`** when closing positions to avoid opening opposite positions
2. **Validate parameters locally** before sending to reduce API errors
3. **Store orderId** for tracking and cancellation
4. **Use `clientId`** for idempotency
5. **Check leverage limits** before placing orders
6. **Monitor rate limits** and implement backoff
7. **Use WebSocket** for real-time position/order updates
8. **Test on Testnet** before production

---

## References

- **Official Docs:** <https://openapidoc.bitunix.com>
- **GitHub Demo:** <https://github.com/BitunixOfficial/open-api>
- **Support:** Contact Bitunix Support for API issues

---

**Generated:** 2026-01-21  
**For:** Cachy App - Trade Execution Integration  
**File:** `docs/bitunix-api/README.md`
=======
### HTTP-Statuscodes
- `200` – Erfolg (auch bei Business-Fehlern; siehe `errorCode` im Body)
- `400` – Bad Request
- `403` – Forbidden
- `404` – Not Found
- `500` – Internal Server Error

## Endpunkt-Übersicht (Kurzreferenz)

### Account
- `POST /api/v1/futures/account/adjust_position_margin`
- `POST /api/v1/futures/account/change_leverage`
- `POST /api/v1/futures/account/change_margin_mode`
- `POST /api/v1/futures/account/change_position_mode`
- `GET  /api/v1/futures/account/get_leverage_margin_mode`
- `GET  /api/v1/futures/account`

### CopyTrading
- `GET  /api/v1/cp/asset/query`
- `POST /api/v1/cp/asset/transfer-to-sub-account`
- `POST /api/v1/cp/asset/transfer-to-main-account`

### Market
- `GET /api/v1/futures/market/depth`
- `GET /api/v1/futures/market/funding_rate/batch`
- `GET /api/v1/futures/market/get_funding_rate_history`
- `GET /api/v1/futures/market/funding_rate`
- `GET /api/v1/futures/market/kline`
- `GET /api/v1/futures/market/tickers`
- `GET /api/v1/futures/market/trading_pairs`

### Position
- `GET /api/v1/futures/position/get_history_positions`
- `GET /api/v1/futures/position/get_pending_positions`
- `GET /api/v1/futures/position/get_position_tiers`

### TP/SL
- `POST /api/v1/futures/tpsl/cancel_order`
- `GET  /api/v1/futures/tpsl/get_history_orders`
- `GET  /api/v1/futures/tpsl/get_pending_orders`
- `POST /api/v1/futures/tpsl/position/modify_order`
- `POST /api/v1/futures/tpsl/modify_order`
- `POST /api/v1/futures/tpsl/position/place_order`
- `POST /api/v1/futures/tpsl/place_order`

### Trade
- `POST /api/v1/futures/trade/batch_order`
- `POST /api/v1/futures/trade/cancel_all_orders`
- `POST /api/v1/futures/trade/cancel_orders`
- `POST /api/v1/futures/trade/close_all_position`
- `POST /api/v1/futures/trade/flash_close_position`
- `GET  /api/v1/futures/trade/get_history_orders`
- `GET  /api/v1/futures/trade/get_history_trades`
- `GET  /api/v1/futures/trade/get_order_detail`
- `GET  /api/v1/futures/trade/get_pending_orders`
- `POST /api/v1/futures/trade/modify_order`
- `POST /api/v1/futures/trade/place_order`

### WebSocket – Private Channels
- Balance Channel
- Order Channel
- Position Channel
- Tp Sl Channel

### WebSocket – Public Channels
- Depth Channel (`depth_books`, `depth_book1`, `depth_book5`, `depth_book15`)
- Kline Channel (`market_kline_*`, `mark_kline_*`)
- MarketPrice Channel (`price`)
- Ticker Channel (`ticker`)
- Tickers Channel (`tickers`)
- Trade Channel (`trade`)
>>>>>>> Stashed changes
