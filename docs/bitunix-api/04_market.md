# Market Endpoints

All endpoints are **public** interfaces (no authentication required).

---

## Get Depth

Source: https://www.bitunix.com/api-docs/futures/market/get_depth.html

**Rate Limit**: 10 req/sec/ip

### Description
Interface for retrieving the futures order book.

### HTTP Request
`GET /api/v1/futures/market/depth`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | true     | Trading pair, based on symbolName, e.g. BTCUSDT |
| limit     | string | false    | Fixed gear enum: `1`/`5`/`15`/`50`/`max`. `max` returns the maximum gear depth of the trading pair. If the actual depth does not meet the limit, the response follows the actual gear |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/depth?symbol=BTCUSDT&limit=max'
```

### Response Parameters
| Parameter      | Type   | Description |
|----------------|--------|-------------|
| asks.index[0]  | string | Ask price |
| asks.index[1]  | string | Ask quantity |
| bids.index[0]  | string | Bid price |
| bids.index[1]  | string | Bid quantity |

### Response Example
```json
{"code":0,"data":{"asks":[[0.1001,0.1],[0.1002,10]],"bids":[[0.1,1],[0.0999,10.23]]},"msg":"Success"}
```

> ⚠️ **Vendor docs — the table above is unusable as written.** The `.index`
> notation (`asks.index[0]`, `asks.index[1]`, `bids.index[0]`, `bids.index[1]`)
> does not exist in the payload: there is no `index` key anywhere in the
> response. The example is nested arrays, so the first ask price is actually at
> `data.asks[0][0]` and the first ask amount at `data.asks[0][1]`, with bids
> likewise under `data.bids`. A parser written from the table cannot read the
> example. The table is transcribed as published.
>
> This is an isolated vendor artifact, not a house convention: the WebSocket
> depth channel documents the same book as `data.a` / `data.b` with no `.index`
> at all (see `08_websocket.md`).

> ⚠️ **Vendor docs — placeholder sample data.** The example above is a
> spot-shaped book (prices ~0.10) returned for a `BTCUSDT` futures request, and
> the request asks for `limit=max` while the payload shows only 2 levels per
> side. Treat it as filler, not as a guarantee about shape or depth.

---

## Get Funding Rate (Batch)

Source: https://www.bitunix.com/api-docs/futures/market/get_funding_rate_batch.html

**Rate Limit**: 10 req/sec/ip

### Description
Retrieves the current funding rate for all contracts (batch).

### HTTP Request
`GET /api/v1/futures/market/funding_rate/batch`

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/funding_rate/batch'
```

### Response Parameters
| Parameter        | Type    | Description |
|------------------|---------|-------------|
| symbol           | string  | Coin pair |
| markPrice        | decimal | Mark price |
| lastPrice        | decimal | Last price |
| indexPrice       | decimal | Index price |
| fundingRate      | decimal | Current funding rate |
| nextFundingTime  | int64   | Next funding settlement (ms) |
| fundingInterval  | int32   | Funding settlement interval (hours) |
| maxFundingRate   | decimal | Maximum current funding rate |
| minFundingRate   | decimal | Minimum current funding rate |

### Response Example
```json
{"code":0,"data":[{"symbol":"BTCUSDT","markPrice":"60000","lastPrice":"60001","indexPrice":"60001","fundingRate":"0.0005","fundingInterval":8,"nextFundingTime":"1770710400000","maxFundingRate":"0.3","minFundingRate":"-0.3"}],"msg":"Success"}
```

---

## Get Funding Rate History

Source: https://www.bitunix.com/api-docs/futures/market/get_funding_rate_history.html

**Rate Limit**: 10 req/sec/ip

### Description
Retrieves the historical funding rate of a contract.

### HTTP Request
`GET /api/v1/futures/market/get_funding_rate_history`

> ⚠️ **Vendor docs — verb in path, transcribe verbatim.** This is the only one
> of the seven market endpoints that puts a verb in its path
> (`get_funding_rate_history`); the other six are noun paths — `/depth`,
> `/kline`, `/tickers`, `/trading_pairs`, `/funding_rate`, and
> `/funding_rate/batch`. The path must be transcribed exactly as shown: an
> implementer who "normalises" it to `/funding_rate/history` gets a 404.
>
> Cross-referencing hazard on the same page: its H1 **and** its anchor are both
> "Get Funding Rate" (`#get-funding-rate`) — byte-identical to the single
> (`funding_rate`) and batch (`funding_rate/batch`) pages, which also share that
> H1 and anchor. The section heading is therefore not a reliable way to tell
> the three funding-rate endpoints apart; use the path.

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | true     | Trading pair, based on symbolName, e.g. BTCUSDT |
| starTime  | int64  | false    | Start timestamp (funding settle time), Unix ms, e.g. 1597026383085 |
| endTime   | int64  | false    | End timestamp (funding settle time), Unix ms, e.g. 1597026383085 |
| limit     | int32  | false    | Default: 100, Maximum: 200 |

> ⚠️ **Vendor docs — `starTime`, not `startTime`.** Re-verified against the live
> page: `starTime` is genuinely spelled without the `t`, it is a **request**
> parameter name (not a response field), and it is still unfixed upstream. Keep
> the vendor spelling — it is a wire parameter name, so "correcting" it breaks
> the request. The page's own curl example never uses it (`?symbol=BTCUSDT&limit=10`
> only), so there is no working example of it anywhere on the page.

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/get_funding_rate_history?symbol=BTCUSDT&limit=10'
```

### Response Parameters
| Parameter    | Type   | Description |
|--------------|--------|-------------|
| markPrice    | string | Mark price |
| fundingRate  | string | Funding rate `[Cachy, not vendor: already a fraction, do NOT divide by 100 — unlike the batch endpoint]` |
| fundingTime  | int64  | Funding timestamp |

> **Note (Cachy annotation, no vendor backing):** the vendor's entire
> description for `fundingRate` is **"Funding rate"** — here *and* on the batch
> page, which says "Current funding rates". Bitunix draws no distinction
> whatsoever between the two endpoints, and the two pages' example values even
> differ (`-0.00001191` here vs `0.0005` on the batch page). The
> "do NOT divide by 100" rule in the cell above is therefore **ours, not a
> transcription**, and is marked so a future reader does not mistake it for
> vendor text.
>
> ⚠️ **The two REST endpoints are treated differently, and only one of the two
> claims has code evidence.**
>
> | | Batch | History (this row) |
> |---|---|---|
> | Unit as treated here | **percentage** — divided by 100 on ingestion | **already a fraction** — the "do NOT divide" rule above |
> | Code evidence | Yes. `fetchBitunixFundingRates` applies `entry.fundingRate.dividedBy(100)` | **None.** Nothing in the repository reads `get_funding_rate_history` |
>
> The batch side is settled by that line in
> [src/services/api/marketData.ts:759](../../src/services/api/marketData.ts).
> The history side is **not** verified: there is no call site, so the "already a
> fraction" reading rests only on an earlier live-wire observation recorded
> during the original crawl. This file and `QUICK_REFERENCE.md` previously
> asserted the opposite of each other here; both now carry the same
> unresolved-and-unverified marking. **Check live wire data before relying on
> this cell** — a 100× error in a funding rate is not visible in a single
> reading.

### Response Example
```json
{"code":0,"data":[{"fundingRate":"-0.00001191","fundingTime":"1772449200000","markPrice":"66286.6"}],"msg":"Success"}
```

---

## Get Funding Rate (Single)

Source: https://www.bitunix.com/api-docs/futures/market/get_funding_rate.html

**Rate Limit**: 10 req/sec/ip

### Description
Retrieves the current funding rate of a single contract.

### HTTP Request
`GET /api/v1/futures/market/funding_rate`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | true     | Trading pair, based on symbolName, e.g. BTCUSDT |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/funding_rate?symbol=BTCUSDT'
```

### Response Parameters
| Parameter        | Type    | Description |
|------------------|---------|-------------|
| symbol           | string  | Coin pair |
| markPrice        | decimal | Mark price |
| lastPrice        | decimal | Last price |
| indexPrice       | decimal | Index price |
| fundingRate      | decimal | Current funding rate |
| nextFundingTime  | int64   | Next funding settlement (ms) |
| fundingInterval  | int32   | Funding settlement interval (hours) |
| maxFundingRate   | decimal | Maximum current funding rate |
| minFundingRate   | decimal | Minimum current funding rate |

### Response Example
```json
{"code":0,"data":[{"symbol":"BTCUSDT","markPrice":"60000","lastPrice":"60001","indexPrice":"60001","fundingRate":"0.0005","fundingInterval":8,"nextFundingTime":"1770710400000","maxFundingRate":"0.3","minFundingRate":"-0.3"}],"msg":"Success"}
```

---

## Get Kline

Source: https://www.bitunix.com/api-docs/futures/market/get_kline.html

**Rate Limit**: 10 req/sec/ip

### Description
Interface for retrieving historical futures kline data.

### HTTP Request
`GET /api/v1/futures/market/kline`

### Request Parameters
| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| symbol     | string | true     | Trading pair, based on symbolName, e.g. BTCUSDT |
| startTime  | int64  | false    | Start time: klines after this point in time, Unix ms, e.g. 1672410780000 |
| endTime    | int64  | false    | End time: klines before this point in time, Unix ms, e.g. 1672410780000 |
| interval   | string | true     | Kline interval (venue lists): `1m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M`. Cachy natively requests `1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M` and synthesizes the rest (see `timeframes.md`). |
| limit      | int    | false    | Default: 100, Maximum: 200 |
| type       | string | false    | Kline type: `LAST_PRICE`, `MARK_PRICE`; Default: `LAST_PRICE` |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/kline?symbol=BTCUSDT&startTime=1&endTime=10234&interval=15m'
```

### Response Parameters
| Parameter | Type    | Description |
|-----------|---------|-------------|
| open      | string  | Opening price |
| high      | string  | Highest price |
| low       | string  | Lowest price |
| close     | string  | Closing price |
| quoteVol  | string  | Trading amount (quote currency turnover) for the kline period |
| baseVol   | string  | Trading volume (base coin) for the kline period |

> **Note (vendor gap, faithfully reproduced):** the vendor's response table
> documents only the six fields above, while its example payload also carries
> `time` and `type`. The vendor omits both from the table, so this mirror does
> too — do not read the table as a complete list of what the endpoint returns.

### Response Example
```json
{"code":0,"data":[{"open":"60000","high":"60001","close":"60000","low":"59989.2","time":111111,"quoteVol":"1","baseVol":"60000","type":"LAST_PRICE"}],"msg":"Success"}
```

---

## Get Tickers

Source: https://www.bitunix.com/api-docs/futures/market/get_tickers.html

**Rate Limit**: 10 req/sec/ip

### Description
Interface for retrieving the futures trading pair tickers.

### HTTP Request
`GET /api/v1/futures/market/tickers`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbols   | string | false    | Trading pairs, based on symbolName, e.g. BTCUSDT,ETHUSDT,XRPUSDT |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/tickers?symbols=BTCUSDT,ETHUSDT'
```

### Response Parameters
| Parameter  | Type   | Description |
|------------|--------|-------------|
| symbol     | string | Coin pair name, e.g. BTCUSDT |
| markPrice  | string | Mark price |
| lastPrice  | string | Last price |
| open       | string | Opening price of the last 24h |
| last       | string | Last price |
| quoteVol   | string | Trading volume of the coin (last 24h) |
| baseVol    | string | Trading volume (last 24h) |
| high       | string | 24h high |
| low        | string | 24h low |

> ⚠️ **Vendor docs — the two volumes are indistinguishable here.** `quoteVol`
> ("Trading volume of the coin (last 24 hours)") and `baseVol` ("Trading volume
> of the last 24 hours") name no currency, so on this page the table never says
> which side is the quote and which the base. The texts above are transcribed as
> published. The disambiguated version of the same concept is the **kline** page
> (see Get Kline above), which is explicit: `quoteVol` = quote-currency
> turnover, `baseVol` = base coin.

### Response Example
```json
{"code":0,"data":[{"symbol":"BTCUSDT","markPrice":"57892.1","lastPrice":"57891.2","open":"6.31","last":"6.31","quoteVol":"0","baseVol":"0","high":"6.31","low":"6.31"},{"symbol":"ETHUSDT","markPrice":"2000","lastPrice":"2020.1","open":"6.31","last":"6.31","quoteVol":"0","baseVol":"0","high":"6.31","low":"6.31"}],"msg":"Success"}
```

> ⚠️ **Vendor docs — placeholder sample data.** The example above is leftover
> from a stock/ETF template, not a real response: every `quoteVol` and `baseVol`
> is `"0"`, and all four OHLC fields (`open`, `last`, `high`, `low`) are `"6.31"`
> on **both** symbols — against a `markPrice` of `57892.1` and `lastPrice` of
> `57891.2` for `BTCUSDT`. Do not use it to infer field semantics or scale.

---

## Get Trading Pairs

Source: https://www.bitunix.com/api-docs/futures/market/get_trading_pairs.html

**Rate Limit**: 10 req/sec/ip

### Description
Interface for retrieving the futures trading pair details.

### HTTP Request
`GET /api/v1/futures/market/trading_pairs`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbols   | string | false    | Trading pairs, based on symbolName, e.g. BTCUSDT,ETHUSDT,XRPUSDT |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/trading_pairs?symbols=BTCUSDT,ETHUSDT'
```

### Response Parameters
| Parameter             | Type    | Description |
|-----------------------|---------|-------------|
| symbol                | string  | Coin pair name, e.g. BTCUSDT |
| base                  | string  | Base currency, e.g. ETH for ETHUSDT |
| quote                 | string  | Quote currency, e.g. USDT for ETHUSDT |
| minTradeVolume        | string  | Minimum opening amount (base coin) |
| minBuyPriceOffset     | string  | Minimum price offset for buy orders |
| maxSellPriceOffset    | string  | Maximum price offset for sell orders |
| maxLimitOrderVolume   | string  | Maximum limit order amount (base coin) |
| maxMarketOrderVolume  | string  | Maximum market order amount (base coin) |
| basePrecision         | int     | Max. precision of the opening amount |
| quotePrecision        | int     | Max. precision of the order price |
| maxLeverage           | int     | Max. leverage |
| minLeverage           | int     | Min. leverage |
| defaultLeverage       | int     | Default leverage |
| defaultMarginMode     | string  | Default margin mode: `Isolation` / `Cross` (observed as int in example; treat as opaque until confirmed) |
| priceProtectScope     | string  | Price protection range. Example: mark price = 10000, priceProtectScope=0.02 → min. sell order price = 10000*(1-0.02)=9800; max. buy order price = 10000*(1+0.02)=10200 |
| symbolStatus          | string  | `OPEN`: normal trading; `CANCEL_ONLY`: cancellation only; `STOP`: no position opening/closing possible |
| isApiSupported        | bool    | `true`: API trading enabled; `false`: API trading disabled |
| maxFundingRate        | decimal | Maximum current funding rate |
| minFundingRate        | decimal | Minimum current funding rate |
| launchTime            | long    | Contract launch time. Unix timestamp in milliseconds (UTC). `null`: uptime not configured |
| delistTime            | long    | Scheduled contract delisting time. Unix timestamp in milliseconds (UTC). Omitted: delisting time not configured or cleared |

> ⚠️ **Vendor docs — `defaultMarginMode` is self-contradictory three ways on one
> row.** The type column says `string`; the enum says `Isolation` / `Cross`; the
> example sends the unquoted integer `1`. Nothing on the page resolves which of
> the three is the wire format. Worse, the same concept is documented in
> **uppercase** on other pages: `marginMode` is `ISOLATION` / `CROSS` in *Change
> Margin Mode* and *Get Leverage and Margin Mode* (`02_account.md`), as are the
> WebSocket `position` and `order` channels (`08_websocket.md`). So Bitunix
> renders one margin mode three ways across two pages, and the two pages'
> examples disagree with each other's enums. The existing hedge in the table —
> "observed as int in example; treat as opaque until confirmed" — is the right
> treatment; keep it and do not let a crawler resolve the contradiction.

> **Note:** `launchTime` and `delistTime` appear in the vendor's response table
> but **not** in its example payload below. An integration written from the
> example alone will never discover them; read them as optional.

### Response Example
```json
{"code":0,"data":[{"symbol":"BTCUSDT","base":"BTC","quote":"USDT","minTradeVolume":"0.0001","minBuyPriceOffset":"-0.95","maxSellPriceOffset":"100","maxLimitOrderVolume":"100000","maxMarketOrderVolume":"50000","basePrecision":4,"quotePrecision":1,"minLeverage":1,"maxLeverage":125,"defaultLeverage":20,"defaultMarginMode":1,"priceProtectScope":"0.02","symbolStatus":"OPEN","isApiSupported":true,"maxFundingRate":"0.3","minFundingRate":"-0.3"}],"msg":"Success"}
```
