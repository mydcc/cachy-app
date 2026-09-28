# Market

Source: <https://www.bitget.com/legacy-docs/classic/contract/market/Get-VIP-Fee-Rate>
Crawled on: 2026-09-28

Bitget's Classic Futures **Market** group holds 20 read endpoints. Nineteen of them are
public: no API key, no signature, no `ACCESS-*` headers — a plain `GET` against
`https://api.bitget.com` is enough. The single exception is **Get Mark/Index/Market Prices**
(`/api/v2/mix/market/symbol-price`), which sits in this public market group but is rate
limited **per user ID** rather than per IP, and is treated as signed throughout this file.

The docs cap all public market interfaces at a unified ceiling of *"a maximum of 20 requests
per second"*, with an overall platform cap of `6000/IP/Min`; both are quoted from the Quick
Start's *Frequency Limiting Rules* and *Access Restriction* sections. **The per-endpoint limit
printed on each page is the one that governs** — the unified ceiling is a ceiling, not a
substitute, and several endpoints here are documented well below it (5/s, 10/s). Exceeding any
limit returns HTTP `429`. Independent of the per-endpoint figures, Bitget's
[VIP Rate Limit Rules](https://www.bitget.com/legacy-docs/classic/rate-limit/) state that
"rate limits are dynamically adjusted based on the user's current VIP level" (Default 10/s
across Spot and Futures; VIP 1 60/s; VIP 2 80/s; VIP 3–7 100/s).

`productType` values are UPPERCASE in V2: `USDT-FUTURES`, `COIN-FUTURES`, `USDC-FUTURES`.
`symbol` is the bare pair (`BTCUSDT`) — the `_UMCBL` suffix does not exist in V2. Coin-M
delivery contracts append a month code instead (`ETHUSDM26`, `BTCUSDH23`).

> **Error signalling differs across this group.** The documented success envelope is
> `code: "00000"` with `msg: "success"` inside an **HTTP 200** — on most of these endpoints a
> business-level failure is *also* an HTTP 200, and the failure is only visible in `code`/`msg`,
> so a client that checks the status line alone will read a rejection as a success. The ticker
> endpoints (`ticker`, `tickers`) instead surface a bad symbol as a **non-2xx** response rather
> than a `code` value. Both behaviours must be handled.

Cachy wires a subset of this group; see `INTEGRATION_STATUS.md`.

## Overview

| # | Endpoint | Method | Auth | Rate limit (as printed) |
|---|---|---|---|---|
| 1 | VIP Fee Rate | `GET /api/v2/mix/market/vip-fee-rate` | public | `Rate limit:10 req/sec/IP` |
| 2 | Get Interest rate history | `GET /api/v2/mix/market/union-interest-rate-history` | public | `Frequency limit:5 times/1s (IP)` |
| 3 | Get Interest Exchange Rate | `GET /api/v2/mix/market/exchange-rate` | public | `Rate limit:5 requests/sec/IP` |
| 4 | Get Discount Rate | `GET /api/v2/mix/market/discount-rate` | public | `Frequency limit:5 times/1s (IP)` |
| 5 | Get Merge Market Depth | `GET /api/v2/mix/market/merge-depth` | public | `Frequency limit: 20 times/1s (IP)` |
| 6 | Get Ticker | `GET /api/v2/mix/market/ticker` | public | `Frequency limit: 20 times/1s (IP)` |
| 7 | Get All Tickers | `GET /api/v2/mix/market/tickers` | public | `Frequency limit: 20 times/1s (IP)` |
| 8 | Get Recent Transactions | `GET /api/v2/mix/market/fills` | public | `Frequency limit: 20 times/1s (IP)` |
| 9 | Get History Transactions | `GET /api/v2/mix/market/fills-history` | public | `Frequency limit: 10 times/1s (IP)` |
| 10 | Get Candlestick Data | `GET /api/v2/mix/market/candles` | public | `Frequency limit: 20 times/1s (IP)` |
| 11 | Get Historical Candlestick | `GET /api/v2/mix/market/history-candles` | public | `Frequency limit: 20 times/1s (IP)` |
| 12 | Get Historical Index Price Candlestick | `GET /api/v2/mix/market/history-index-candles` | public | `Frequency limit: 20 times/1s (IP)` |
| 13 | Get Historical Mark Price Candlestick | `GET /api/v2/mix/market/history-mark-candles` | public | `Frequency limit: 20 times/1s (IP)` |
| 14 | Get Open Interest | `GET /api/v2/mix/market/open-interest` | public | `Frequency limit: 20 times/1s (IP)` |
| 15 | Get Next Funding Time | `GET /api/v2/mix/market/funding-time` | public | `Frequency limit: 20 times/1s (IP)` |
| 16 | Get Mark/Index/Market Prices | `GET /api/v2/mix/market/symbol-price` | private (signed) | `20 times/s, frequency is limited according to user ID` |
| 17 | Get Historical Funding Rates | `GET /api/v2/mix/market/history-fund-rate` | public | `Frequency limit: 20 times/1s (IP)` |
| 18 | Get Current Funding Rate | `GET /api/v2/mix/market/current-fund-rate` | public | `Frequency limit: 20 times/1s (IP)` |
| 19 | Get Contract OI Limit | `GET /api/v2/mix/market/oi-limit` | public | `Rate Limit: 10 req/sec/IP` |
| 20 | Get Contract Config | `GET /api/v2/mix/market/contracts` | public | `Rate Limit: 20 req/sec/IP` |

> **The rate-limit column is quoted verbatim and is deliberately un-normalised.** Bitget prints
> these twenty limits in five different formats — `Rate limit:`, `Rate Limit:`, and
> `Frequency limit:` with and without a space after the colon, `req/sec/IP` vs `times/1s (IP)`,
> and one page that states neither a colon nor a unit. They all mean roughly the same thing; the
> inconsistencies are preserved above rather than tidied away, because a tidied limit is a
> number nobody can trace back to a page.

---

## VIP Fee Rate

- Rate limit: `Rate limit:10 req/sec/IP`
- Auth: `public`
- Scope: per IP

Returns the maker/taker fee schedule per VIP tier, plus 24-hour withdrawal limits. No
request parameters.

### HTTP Request

`GET /api/v2/mix/market/vip-fee-rate`

```bash
curl "https://api.bitget.com/api/v2/mix/market/vip-fee-rate"
```

### Request Parameters

None.

### Response Fields

Envelope: `code`, `msg`, `requestTime`, `data[]`.

| Field | Type | Description |
|---|---|---|
| `data[].level` | String | VIP level |
| `data[].dealAmount` | String | Total trading volume of the last 30 days, USDT |
| `data[].assetAmount` | String | Total assets, USDT |
| `data[].takerFeeRate` | String | Taker rate. `"0.000425"` means 4.25 with four decimal places ahead |
| `data[].makerFeeRate` | String | Maker rate. `"0.00006"` means 0.6 with four decimal places ahead |
| `data[].btcWithdrawAmount` | String | 24-hour withdrawal limit (BTC) |
| `data[].usdtWithdrawAmount` | String | 24-hour withdrawal limit (USDT) |

---

## Get Interest rate history

- Rate limit: `Frequency limit:5 times/1s (IP)`
- Auth: `public`
- Scope: per IP

Annual and daily interest rates for a coin, with per-record timestamps.

### HTTP Request

`GET /api/v2/mix/market/union-interest-rate-history`

```bash
curl "https://api.bitget.com/api/v2/mix/market/union-interest-rate-history?coin=USDT"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `coin` | String | Yes | Coin asset |

### Response Fields

Envelope: `code`, `msg`, `requestTime`, `data`.

| Field | Type | Description |
|---|---|---|
| `data.coin` | String | Assets |
| `data.historyInterestRateList[].annualInterestRate` | String | Annual interest rate |
| `data.historyInterestRateList[].dailyInterestRate` | String | Daily interest rate |
| `data.historyInterestRateList[].ts` | String | Interest time |

---

## Get Interest Exchange Rate

- Rate limit: `Rate limit:5 requests/sec/IP`
- Auth: `public`
- Scope: per IP

Tiered exchange (conversion) rates per coin, in effect for the USDT-M earn / conversion flow.

### HTTP Request

`GET /api/v2/mix/market/exchange-rate`

```bash
curl "https://api.bitget.com/api/v2/mix/market/exchange-rate"
```

### Request Parameters

None.

### Response Fields

| Field | Type | Description |
|---|---|---|
| `data[].coin` | String | Assets |
| `data[].exchangeRateList[].tier` | String | Tier |
| `data[].exchangeRateList[].minAmount` | String | Min |
| `data[].exchangeRateList[].maxAmount` | String | Max. `-1` means there is no limitation |
| `data[].exchangeRateList[].exchangeRate` | String | Exchange rate |

> **Doc defect.** The tier list gives `Min` / `Max` with no unit — the denomination of
> `minAmount` and `maxAmount` is not stated, and neither is the unit of `exchangeRate`
> (rate pairs per unit? percentage?).

---

## Get Discount Rate

- Rate limit: `Frequency limit:5 times/1s (IP)`
- Auth: `public`
- Scope: per IP

Tiered discount rates for futures-fee settlement, per coin, with per-user and platform-wide
caps.

### HTTP Request

`GET /api/v2/mix/market/discount-rate`

```bash
curl "https://api.bitget.com/api/v2/mix/market/discount-rate"
```

### Request Parameters

None.

### Response Fields

| Field | Type | Description |
|---|---|---|
| `data[].coin` | String | Assets |
| `data[].userLimit` | String | Individual limit |
| `data[].totalLimit` | String | Total platform limit |
| `data[].discountRateList[].tier` | String | Tier |
| `data[].discountRateList[].minAmount` | String | Min |
| `data[].discountRateList[].maxAmount` | String | Max |
| `data[].discountRateList[].discountRate` | String | Discount rate |

> **Doc defect.** As with the exchange-rate tiers above, the amounts carry no unit, and
> `discountRate` has no stated scale (decimal fraction vs percentage) — the VIP Fee Rate page
> spells its scale out explicitly, this one does not.

---

## Get Merge Market Depth

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`
- Scope: per IP

Cumulative, price-bucketed order-book depth. Two shape parameters control the output:
`precision` selects the price bucket, `limit` selects the number of levels.

### HTTP Request

`GET /api/v2/mix/market/merge-depth`

```bash
curl "https://api.bitget.com/api/v2/mix/market/merge-depth?productType=usdt-futures&symbol=BTCUSDT"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |
| `precision` | String | No | Price accuracy. Enumeration `scale0`/`scale1`/`scale2`/`scale3`; `scale0` is unmerged and is the default. `scale1` is generally the pair's quotation accuracy ×10, `scale2` ×100, `scale3` ×1000. The precision actually applied is subject to the returned `scale` field. Pairs have different quotation precision, and some pairs do not have `scale2`; a request for a scale the pair does not have is processed at the maximum scale it does have (e.g. a pair with only `scale0`/`scale1` downgrades a `scale2` request to `scale1`) |
| `limit` | String | No | Fixed gear enumeration `1`/`5`/`15`/`50`/`max`; the default gear is `100`; passing `max` returns the pair's maximum gear. When actual depth does not meet the limit, the actual gear is returned |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `data.asks` | List\<String\> | Selling price. Elements are price and quantity; index 0 = price, index 1 = quantity |
| `data.bids` | List\<String\> | Buying price. Same element layout as `asks` |
| `data.ts` | String | Matching-engine timestamp in ms, e.g. `1597026383085` |
| `data.scale` | String | Actual precision value applied |
| `data.precision` | String | Requested precision |
| `data.isMaxPrecision` | String | `YES` = current accuracy is the maximum, `NO` = not |

> **Doc defects on this page.**
> 1. **The example contradicts the parameter table.** The parameter table specifies UPPERCASE
>    `USDT-FUTURES`, but the request example on this very page sends `productType=usdt-futures`.
> 2. **`limit` default is not in its own enumeration.** The gear list is `1/5/15/50/max`, yet the
>    text says the default gear is `100`. The [Classic Account](https://www.bitget.com/legacy-docs/classic/intro)
>    page repeats the same "default: 100" alongside the same enumeration, so the inconsistency
>    is systematic across the docs rather than a single typo.
> 3. **`precision` description has an unclosed parenthesis** after `quotation accuracy*10`, and
>    the grammar slips ("some trading pairs does not have").
> 4. **`scale` is typed `String`** but the response example shows a numeric-looking value
>    (`"0.1"`), so the field is a decimal step expressed as a string.

---

## Get Ticker

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`
- Scope: per IP

Single-symbol snapshot: last, bid, ask, mark and index price, 24h stats, funding rate, open
interest and — for delivery contracts — the delivery window.

### HTTP Request

`GET /api/v2/mix/market/ticker`

```bash
curl "https://api.bitget.com/api/v2/mix/market/ticker?productType=COIN-FUTURES&symbol=ETHUSDM26"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `data[].symbol` | String | Trading pair name |
| `data[].lastPr` | String | Last price |
| `data[].askPr` | String | Ask price |
| `data[].bidPr` | String | Bid price |
| `data[].bidSz` | String | Buying amount |
| `data[].askSz` | String | Selling amount |
| `data[].high24h` | String | 24h high |
| `data[].low24h` | String | 24h low |
| `data[].ts` | String | Current data timestamp, Unix ms, e.g. `1597026383085` |
| `data[].change24h` | String | Price increase or decrease over 24 hours |
| `data[].baseVolume` | String | Trading volume of the coin |
| `data[].quoteVolume` | String | Trading volume of quote currency |
| `data[].usdtVolume` | String | Trading volume of USDT |
| `data[].openUtc` | String | UTC0 opening price |
| `data[].changeUtc24h` | String | UTC0 24-hour price change |
| `data[].indexPrice` | String | Index price |
| `data[].fundingRate` | String | Funding rate |
| `data[].holdingAmount` | String | Current holding positions (base coin) |
| `data[].open24h` | String | Entry price of the last 24 hours. The opening time is compared on a rolling 24-hour basis |
| `data[].deliveryStartTime` | String | Delivery start time (delivery contracts only) |
| `data[].deliveryTime` | String | Delivery time (delivery contracts only) |
| `data[].deliveryStatus` | String | Delivery status, delivery contracts only: `delivery_config_period` (newly listed pair being configured), `delivery_normal` (trading normally), `delivery_before` (10 minutes before delivery, opening positions prohibited), `delivery_period` (delivery — opening, closing and cancelling orders prohibited) |
| `data[].markPrice` | String | Mark price |

> **Doc defects on this page.**
> 1. **`deliveryTime`'s description closes with a full-width right parenthesis** (`）`) instead of
>    the ASCII `)`.
> 2. **Sample payload values are internally inconsistent** — the example carries
>    `lastPr: "1829.3"` alongside `indexPrice: "1822.15"` and `markPrice: "1829"`, and
>    `high24h`/`low24h`/`change24h`/`baseVolume` are all literal `"0"`. The example is
>    illustrative only; do not read the numbers as a consistent snapshot.
> 3. This page is one of only two in the group whose example uses UPPERCASE `productType`; every
>    other example uses lowercase. See the note in *Doc defects* below.

---

## Get All Tickers

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`
- Scope: per IP

The `ticker` payload for every contract of one product type. Same response shape as
[Get Ticker](#get-ticker), one array element per symbol.

### HTTP Request

`GET /api/v2/mix/market/tickers`

```bash
curl "https://api.bitget.com/api/v2/mix/market/tickers?productType=COIN-FUTURES"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |

### Response Fields

Identical to [Get Ticker](#get-ticker), with one documented wording difference:
`data[].holdingAmount` is "Current positions in the unit of number of coins traded."

> **Doc defects on this page.** The example returns a Coin-M delivery symbol written
> `ETHUSD_231229` (underscore plus 6 digits), which is not the delivery symbol format
> documented on the [Classic Account](https://www.bitget.com/legacy-docs/classic/intro) page
> (`ETHUSDH23` / `ETHUSDM23` — pair + month code + 2-digit year). `markPrice` in the same
> example is `"12345"` against a `lastPr` of `"29904.5"`. As above, the numbers are
> placeholders, not a coherent snapshot.

---

## Get Recent Transactions

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`
- Scope: per IP

The most recent public fills for one symbol — the tape, not your own trades. Hard-capped at
100 records with no time-range or cursor parameters.

### HTTP Request

`GET /api/v2/mix/market/fills`

```bash
curl "https://api.bitget.com/api/v2/mix/market/fills?symbol=BTCUSDT&productType=usdt-futures"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |
| `limit` | String | No | Number of queries. Default 100, maximum 100 |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `data[].tradeId` | String | Transaction ID |
| `data[].price` | String | Price |
| `data[].size` | String | Quantity |
| `data[].side` | String | Direction |
| `data[].ts` | String | Current data timestamp, Unix ms, e.g. `1597026383085` |
| `data[].symbol` | String | Trading pair name, e.g. `ETHUSDT` |

---

## Get History Transactions

- Rate limit: `Frequency limit: 10 times/1s (IP)`
- Auth: `public`
- Scope: per IP

The historical public tape, up to 90 days, with cursor and time-range paging.

### HTTP Request

`GET /api/v2/mix/market/fills-history`

```bash
curl "https://api.bitget.com/api/v2/mix/market/fills-history?symbol=BTCUSDT&productType=usdt-futures"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |
| `limit` | String | No | Number of queries. Default 500, maximum 1000 |
| `idLessThan` | String | No | Page content before this ID (older data). Pass the `endId` of the corresponding interface |
| `startTime` | String | No | Start timestamp, Unix ms, e.g. `1597026383085`. Maximum supported span is a week. If no end time is set, the default end time is a week out |
| `endTime` | String | No | End timestamp, Unix ms, e.g. `1597026383085`. Maximum supported span is a week. If no start time is set, the default start time is a week ago |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `data[].tradeId` | String | tradeId, descending order |
| `data[].price` | String | Price |
| `data[].size` | String | Amount, specific base coin |
| `data[].side` | String | Trading direction: `sell` Sell, `buy` Buy |
| `data[].ts` | String | Current data timestamp, Unix ms, e.g. `1597026383085` |
| `data[].symbol` | String | Trading pair name |

> **Doc defects on this page.**
> 1. **`side` casing contradicts its own example.** The field table documents lowercase `sell` /
>    `buy`; the response example returns `"Sell"` / `"Buy"` capitalised. On
>    [Get Recent Transactions](#get-recent-transactions) the table and example agree on lowercase.
>    The two fills endpoints therefore disagree with each other as well as internally.
> 2. **`idLessThan` names a parameter the API never returns.** Its description says to pass
>    "the endId of the corresponding interface", but no response field in this group is called
>    `endId` — the id field here is `tradeId`.
> 3. The description bullet "The time interval between startTime and endTime should not exceed
>    7 days" is stated twice, once in Description and once inside each of the two timestamp
>    parameter rows.

---

## Get Candlestick Data

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`
- Scope: per IP

Candles for a symbol, **including the still-forming current bar**. Returns 100 records by
default; an empty array means no data.

### HTTP Request

`GET /api/v2/mix/market/candles`

```bash
curl "https://api.bitget.com/api/v2/mix/market/candles?symbol=BTCUSDT&granularity=5m&limit=100&productType=usdt-futures"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |
| `granularity` | String | Yes | K-line particle size — see enum below |
| `startTime` | String | No | Query k-lines after this time. Rounded **down** to the granularity's time unit. Unix ms, e.g. `1672410780000`. Maximum time query range 90 days |
| `endTime` | String | No | Query k-lines before this time. Rounded **down** to the granularity's time unit. Unix ms, e.g. `1672410780000`. Maximum time query range 90 days |
| `kLineType` | String | No | Candlestick chart type: `market`, `mark`, `index`. Defaults to `market` |
| `limit` | String | No | Default 100, maximum 1000 |

#### `granularity` enum

`1m`, `3m`, `5m`, `15m`, `30m`, `1H`, `4H`, `6H`, `12H`, `1D`, `3D`, `1W`, `1M`, `6Hutc`,
`12Hutc`, `1Dutc`, `3Dutc`, `1Wutc`, `1Mutc`

The `utc` variants are the same intervals anchored to UTC rather than to local midnight;
`3m` is the shortest non-`utc` interval and `1m` the shortest overall.

#### Candle retention per granularity

Queryable history is **not** uniform across granularities. As printed on this page:

| Granularity | Queryable history |
|---|---|
| `1m`, `3m`, `5m` | up to one month |
| `15m` | up to 52 days |
| `30m` | up to 62 days |
| `1H` | up to 83 days |
| `2H` | up to 120 days |
| `4H` | up to 240 days |
| `6H` | up to 360 days |

Granularities **not listed** in the retention table — `12H`, `1D`, `3D`, `1W`, `1M` and every
`utc` variant — have **no stated retention limit** in the docs. Do not read the `6H` row's
360 days as a floor for coarser intervals.

> **Doc defects on this page.**
> 1. **`2H` is in the retention table but not in the `granularity` enum.** The same page
>    documents a 120-day retention rule for `2H` while the accepted-values list has no `2H`
>    entry. Whether `granularity=2H` is accepted is not determinable from the docs.
> 2. **The `kLineType` description is garbled**: it prints as `market tick; mark mark; index
>    index;` — the value name and its English gloss are the same word in each pair, so the
>    intended glosses (last price / mark price / index price) have to be inferred. The default
>    of `market` is stated.
> 3. **Retention is documented only here.** None of the three `history-*-candles` pages repeat
>    these limits, so this table governs them by inference only — see the next three sections.

### Response Fields

Returned as an array of 7-element string arrays, not objects.

| Field | Type | Description |
|---|---|---|
| `[0]` | String | Timestamp, Unix ms, e.g. `1597026383085` |
| `[1]` | String | Entry price (open) |
| `[2]` | String | Highest price (high) |
| `[3]` | String | Lowest price (low) |
| `[4]` | String | Exit price (close). The latest exit price may still be updated in future; subscribe to WebSocket to track the latest price |
| `[5]` | String | Trading volume of the base coin |
| `[6]` | String | Trading volume of quote currency |

---

## Get Historical Candlestick

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`
- Scope: per IP

The finished-candle counterpart of `/candles`: only completed intervals, capped at 200
records.

### HTTP Request

`GET /api/v2/mix/market/history-candles`

```bash
curl "https://api.bitget.com/api/v2/mix/market/history-candles?symbol=BTCUSDT&granularity=1W&limit=200&productType=usdt-futures"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |
| `granularity` | String | Yes | K-line particle size — identical enum to [Get Candlestick Data](#get-candlestick-data) |
| `startTime` | String | No | Query k-lines after this time. Rounded down to the granularity's time unit. Unix ms. Maximum time query range 90 days |
| `endTime` | String | No | Query k-lines before this time. Rounded down to the granularity's time unit. Unix ms. Maximum time query range 90 days |
| `limit` | String | No | Default 100, maximum 200 |

> **No `kLineType` parameter exists on this endpoint.** This is the last-price series only.

### Response Fields

| Field | Type | Description |
|---|---|---|
| `[0]` | String | Timestamp, Unix ms, e.g. `1597026383085` |
| `[1]` | String | Entry price (open) |
| `[2]` | String | Highest price (high) |
| `[3]` | String | Lowest price (low) |
| `[4]` | String | Exit price (close) — only finished K-line data is included |
| `[5]` | String | Trading volume of the base coin |
| `[6]` | String | Trading volume of quote currency |

> **Doc note (behaviour, not a defect).** The page warns: *"If endTime goes past a candle
> interval boundary (even by 1 ms), the system may round up when calculating the number of
> candles, and the response may include one additional interval (i.e., the returned data may
> start one interval earlier)."* A history page can therefore return one bar more than its
> nominal `limit` implies.

---

## Get Historical Index Price Candlestick

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`
- Scope: per IP

The **index-price** candle series, as a dedicated endpoint rather than a `kLineType` value.
Same 7-element array shape, finished candles only, 200 maximum.

### HTTP Request

`GET /api/v2/mix/market/history-index-candles`

```bash
curl "https://api.bitget.com/api/v2/mix/market/history-index-candles?symbol=BTCUSDT&granularity=5m&endTime=1691329771000&limit=100&startTime=1688824171000&productType=usdt-futures"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |
| `granularity` | String | Yes | K-line particle size — identical enum to [Get Candlestick Data](#get-candlestick-data) |
| `startTime` | String | No | Query k-lines after this time. Rounded down to the granularity's time unit. Unix ms. Maximum time query range 90 days |
| `endTime` | String | No | Query k-lines before this time. Rounded down to the granularity's time unit. Unix ms. Maximum time query range 90 days |
| `limit` | String | No | Default 100, maximum 200 |

> **No `kLineType` parameter.** The series is implied by the path.

### Response Fields

| Field | Type | Description |
|---|---|---|
| `[0]` | String | Timestamp, Unix ms, e.g. `1597026383085` |
| `[1]` | String | Entry price (open) |
| `[2]` | String | Highest price (high) |
| `[3]` | String | Lowest price (low) |
| `[4]` | String | Exit price (close) — only finished K-line data is included |
| `[5]` | String | Trading volume of the base coin |
| `[6]` | String | Trading volume of quote currency |

> **Doc note.** Volumes `[5]` and `[6]` are documented as trading volumes, but the example
> returns `"0"` for both — an index-price series has no traded volume. The fields are present
> in the schema regardless; treat them as always-zero for this endpoint rather than relying on
> their presence to mean "traded".

---

## Get Historical Mark Price Candlestick

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`
- Scope: per IP

The **mark-price** candle series, as a dedicated endpoint. Same shape and limits as the index
variant.

### HTTP Request

`GET /api/v2/mix/market/history-mark-candles`

```bash
curl "https://api.bitget.com/api/v2/mix/market/history-mark-candles?symbol=BTCUSDT&granularity=5m&endTime=1691329771000&limit=100&startTime=1688824171000&productType=usdt-futures"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |
| `granularity` | String | Yes | K-line particle size — identical enum to [Get Candlestick Data](#get-candlestick-data) |
| `startTime` | String | No | Query k-lines after this time. Rounded down to the granularity's time unit. Unix ms. Maximum time query range 90 days |
| `endTime` | String | No | Query k-lines before this time. Rounded down to the granularity's time unit. Unix ms. Maximum time query range 90 days |
| `limit` | String | No | Default 100, maximum 200 |

> **No `kLineType` parameter.** The series is implied by the path.

### Response Fields

| Field | Type | Description |
|---|---|---|
| `[0]` | String | Timestamp, Unix ms, e.g. `1597026383085` |
| `[1]` | String | Entry price (open) |
| `[2]` | String | Highest price (high) |
| `[3]` | String | Lowest price (low) |
| `[4]` | String | Exit price (close) — only finished K-line data is included |
| `[5]` | String | Trading volume of the base coin |
| `[6]` | String | Trading volume of quote currency |

> **Doc note.** As with the index variant, the example returns `"0"` for both volume slots.

---

### Mark vs index vs last-price candles: two mechanisms, both present

This is the question that most often gets answered wrongly, so the two routes Bitget offers
are set out explicitly.

| | Last / mark / index on one endpoint | Separate historical endpoints |
|---|---|---|
| Endpoint | `GET /api/v2/mix/market/candles` | `GET /api/v2/mix/market/history-candles` (last), `.../history-mark-candles` (mark), `.../history-index-candles` (index) |
| Series selected by | the `kLineType` parameter — `market` (default), `mark`, `index` | the request path; **no `kLineType` parameter exists** on any `history-*-candles` page |
| Current, unfinished bar | Included | Never — "Only include the finished K line data" |
| Max `limit` | 1000 | 200 |
| Retention rules printed | Yes (the per-granularity table) | No — inherit the `candles` rules by inference only |

**So: yes, Bitget has separate mark candles — and also a mark-mode on the main candle
endpoint.** The two are not redundant. `/candles?kLineType=mark` is the only way in this
group to get a mark-price series *including the in-progress bar*; `/history-mark-candles` is
the completed-bars view, capped lower, and its mark series is selected by URL rather than by
parameter. A client that requests mark candles must pick one route deliberately; the two do not
return the same window and the paths are not interchangeable.

The practical consequence for anything that must not mislabel its data: a mark-price request
satisfied by a last-price series is a silent correctness failure, because the payload shape is
byte-for-byte identical — a 7-element string array with no series tag in it. There is no field
in any of these four responses that identifies the series. The only thing distinguishing
`/candles?kLineType=mark` from `/candles` is the request itself.

---

## Get Open Interest

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`
- Scope: per IP

Platform-wide open interest for a symbol, in base-coin units, with a data timestamp.

### HTTP Request

`GET /api/v2/mix/market/open-interest`

```bash
curl "https://api.bitget.com/api/v2/mix/market/open-interest?symbol=BTCUSDT&productType=usdt-futures"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `data.ts` | String | Data time, Unix ms, e.g. `1672410780000` |
| `data.openInterestList` | String | Open interest data collection |
| `data.openInterestList[].symbol` | String | Trading pair name |
| `data.openInterestList[].size` | String | Total open interest of the platform, in the specific coin, e.g. ETH in ETHUSDT |

> **Doc defect.** `data.openInterestList` is typed `String` in the response table, but the
> response example shows it as an **object containing an array** (`"openInterestList": [ … ]`).
> A client generated from the type table alone would parse it wrongly.

---

## Get Next Funding Time

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`
- Scope: per IP

The next settlement timestamp and the settlement interval, per symbol. Pairs the funding
timestamp with the rate — the two are always needed together.

### HTTP Request

`GET /api/v2/mix/market/funding-time`

```bash
curl "https://api.bitget.com/api/v2/mix/market/funding-time?symbol=BTCUSDT&productType=usdt-futures"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `data[].symbol` | String | Trading pair name |
| `data[].nextFundingTime` | String | Next settlement time (ms) |
| `data[].ratePeriod` | String | Rate settlement cycle, in hours |

> **Doc note.** `ratePeriod` is a bare hour count in the example (`"8"`) with no stated
> enumeration. The enumeration `1, 2, 4, 8` is only printed on
> [Get Current Funding Rate](#get-current-funding-rate)'s `fundingRateInterval` field, which
> carries the same information under a different name.

---

## Get Mark/Index/Market Prices

- Rate limit: `20 times/s, frequency is limited according to user ID`
- Auth: `private (signed)`
- Scope: **per user ID** — the only endpoint in this group not scoped by IP

The narrowest price call in the group: one symbol, three prices, one timestamp.

> ⚠️ **This endpoint is not a public market endpoint, despite its location.** It is filed under
> the public `Market` group, but it is the one endpoint here whose limit is scoped **by user
> ID** rather than by IP — `20 times/s, frequency is limited according to user ID`. That
> per-UID scoping is only meaningful for an authenticated caller, so the request must be signed
> with `ACCESS-KEY` / `ACCESS-SIGN` / `ACCESS-TIMESTAMP` / `ACCESS-PASSPHRASE`, and its budget
> is consumed against a UID rather than against an IP address. Note the numeric coincidence that
> makes this easy to miss: its ceiling (20/s) is identical to the unified public-market ceiling,
> so a per-endpoint check against the public limit will pass while the request is being rejected
> for missing credentials.
>
> **What the page does and does not say.** The page prints no explicit "requires signature" line
> and no auth table — only the UID-scoped limit. The public/private classification here is
> inferred from that scoping, since the group placement and the limit scope disagree. Treat the
> signature requirement as authoritative and the absence of a printed auth note as a
> documentation gap.

### HTTP Request

`GET /api/v2/mix/market/symbol-price`

```bash
curl "https://api.bitget.com/api/v2/mix/market/symbol-price?productType=usdt-futures&symbol=BTCUSDT"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `data[].symbol` | String | Trading pair name |
| `data[].price` | String | Latest price of the exchange |
| `data[].indexPrice` | String | Index price |
| `data[].markPrice` | String | Mark price |
| `data[].ts` | String | Current data timestamp, Unix ms, e.g. `1672410780000` |

> **Doc defect.** The example payload is internally inconsistent: `price: "26242"` against
> `indexPrice: "34867"` — a ~33% spread between the last trade and the index on the same
> symbol at the same millisecond. Read the example as a shape reference only.

---

## Get Historical Funding Rates

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`
- Scope: per IP

Settled funding rates for a symbol, newest first, paged by number rather than by cursor.

### HTTP Request

`GET /api/v2/mix/market/history-fund-rate`

```bash
curl "https://api.bitget.com/api/v2/mix/market/history-fund-rate?symbol=BTCUSDT&productType=usdt-futures"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | Yes | Trading pair |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |
| `pageSize` | String | No | Number of queries. Default 20, maximum 100 |
| `pageNo` | String | No | Page number |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `data[].symbol` | String | Trading pair name |
| `data[].fundingRate` | String | Funding rate |
| `data[].fundingTime` | String | Settlement time |

> **Doc note.** This is the only endpoint in the group that pages with `pageNo`/`pageSize`
> instead of `idLessThan`/`startTime`/`endTime`, and it accepts **no time-range filter at all** —
> how far back the history reaches is not stated anywhere in the docs. Do not assume the 90-day
> window of [Get History Transactions](#get-history-transactions) applies here.

---

## Get Current Funding Rate

- Rate limit: `Frequency limit: 20 times/1s (IP)`
- Auth: `public`
- Scope: per IP

The funding rate currently in force, its interval, the next update time, and the per-symbol
floor and ceiling.

### HTTP Request

`GET /api/v2/mix/market/current-fund-rate`

```bash
curl "https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT&productType=usdt-futures"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | No | Trading pair |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `data[].symbol` | String | Trading pair name |
| `data[].fundingRate` | String | Current funding rate |
| `data[].fundingRateInterval` | String | Funding rate settlement period. Unit: hours. Enumeration `1`, `2`, `4`, `8` — 1 is 1 hour, 2 is 2 hours, and so on |
| `data[].nextUpdate` | String | Next update time, Unix ms |
| `data[].minFundingRate` | String | Lower limit of funding rate. "Returned in decimal form. 0.025 represents 2.5%." |
| `data[].maxFundingRate` | String | Upper limit of funding rate. "Returned in decimal form. 0.025 represents 2.5%." |

> **Doc defects on this page.**
> 1. **`symbol` is marked optional** (`No`) while `productType` is required — yet the endpoint
>    is per-symbol and returns `fundingRate`, `minFundingRate` and `maxFundingRate` for one
>    `symbol`. What an omitted `symbol` returns is not defined. Compare
>    [Get Contract OI Limit](#get-contract-oi-limit) and
>    [Get Contract Config](#get-contract-config), where optional `symbol` is explained as
>    "return everything for this product type".
> 2. **The min/max scale description is self-contradictory.** "Returned in decimal form. 0.025
>    represents 2.5%." — read as a decimal fraction, `0.025` *is* 2.5%, so the sentence states
>    the same thing twice in a way that invites the opposite reading. The example returns
>    `"-0.003"` / `"0.003"`, consistent with a decimal fraction. Compare the unambiguous phrasing
>    on [VIP Fee Rate](#vip-fee-rate), which spells out the four-decimal convention.

---

## Get Contract OI Limit

- Rate limit: `Rate Limit: 10 req/sec/IP`
- Auth: `public`
- Scope: per IP

The open-interest cap that applies to a contract: per-user, and per-user-plus-sub-accounts.

### HTTP Request

`GET /api/v2/mix/market/oi-limit`

```bash
curl "https://api.bitget.com/api/v2/mix/market/oi-limit?productType=usdt-futures&symbol=BTCUSDT"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | No | Trading pair, based on the symbolName, i.e. `BTCUSDT` |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `data[].symbol` | String | Product name |
| `data[].notionalValue` | String | Individual user position notional value |
| `data[].totalNotionalValue` | String | Sub-account and main-account position notional value |

> **Doc note.** Despite the `userLimit` / `totalLimit` framing of similar endpoints, this is a
> **public, per-IP, unsigned** read of a limit that is enforced per user — the numbers are the
> same for every caller and carry no UID. `notionalValue` and `totalNotionalValue` are notional
> (quote-currency) caps; the docs do not state the quote currency, so it follows the contract's
> own settlement asset and is not fixed to USDT for `COIN-FUTURES`.

---

## Get Contract Config

- Rate limit: `Rate Limit: 20 req/sec/IP`
- Auth: `public`
- Scope: per IP

The instrument master record: precision, fees, order and position limits, leverage bounds,
margin coins, funding interval, lifecycle status and maintenance windows. This is the endpoint
that defines what every other endpoint's `symbol` and `pricePlace`/`volumePlace` values mean.

### HTTP Request

`GET /api/v2/mix/market/contracts`

```bash
curl "https://api.bitget.com/api/v2/mix/market/contracts?productType=usdt-futures&symbol=BTCUSDT"
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbol` | String | No | Trading pair, based on the symbolName, i.e. `BTCUSDT` |
| `productType` | String | Yes | Product type. `USDT-FUTURES` USDT-M Futures, `COIN-FUTURES` Coin-M Futures, `USDC-FUTURES` USDC-M Futures |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `data[].symbol` | String | Product name |
| `data[].baseCoin` | String | Base currency, e.g. ETH in ETHUSDT |
| `data[].quoteCoin` | String | Quote currency, e.g. USDT in ETHUSDT |
| `data[].buyLimitPriceRatio` | String | Ratio of bid price to limit price |
| `data[].sellLimitPriceRatio` | String | Ratio of ask price to limit price |
| `data[].feeRateUpRatio` | String | Transaction fee increase ratio |
| `data[].makerFeeRate` | String | Maker rate |
| `data[].takerFeeRate` | String | Taker rate |
| `data[].openCostUpRatio` | String | Opening cost increase ratio |
| `data[].supportMarginCoins` | List\<String\> | Supported margin coins |
| `data[].minTradeNum` | String | Minimum opening amount, base currency |
| `data[].priceEndStep` | String | Price step length |
| `data[].volumePlace` | String | Decimal places of the quantity |
| `data[].pricePlace` | String | Decimal places of the price |
| `data[].sizeMultiplier` | String | Quantity multiplier — order quantity must be greater than `minTradeNum` and a multiple of `sizeMulti` |
| `data[].symbolType` | String | Futures type: `perpetual` or `delivery` |
| `data[].minTradeUSDT` | String | Minimum USDT transaction amount |
| `data[].maxSymbolOrderNum` | String | Maximum number of orders held, symbol dimension |
| `data[].maxProductOrderNum` | String | Maximum number of held orders, product-type dimension |
| `data[].maxPositionNum` | String | Maximum number of positions held |
| `data[].symbolStatus` | String | Trading pair status — `listed` (listing symbol), `normal` (trade normal), `maintain` (can't open/close position), `limit_open` (can't place orders, can close position), `restrictedAPI` (can't place orders with API), `off` (offline) |
| `data[].offTime` | String | Trading halt time; `-1` means normal |
| `data[].limitOpenTime` | String | Time to open positions; `-1` means normal. Other values indicate the symbol is under maintenance or to be maintained and trading is prohibited after the specified time |
| `data[].deliveryTime` | String | Delivery time |
| `data[].deliveryStartTime` | String | Delivery start time |
| `data[].deliveryPeriod` | String | Delivery period — `this_quarter` (current quarter), `next_quarter` (second quarter) |
| `data[].launchTime` | String | Listing time |
| `data[].fundInterval` | String | Funding fee settlement cycle, hourly / every 8 hours |
| `data[].minLever` | String | Minimum leverage |
| `data[].maxLever` | String | Maximum leverage |
| `data[].posLimit` | String | Position limits (**deprecated**) |
| `data[].maintainTime` | String | Maintenance time — has a value when the status is under maintenance or upcoming maintenance |
| `data[].maxMarketOrderQty` | String | Maximum order quantity for a single market order, in base coin |
| `data[].maxOrderQty` | String | Maximum order quantity for a single limit order, in base coin |
| `data[].isRwa` | String | Is this an RWA symbol: `YES` or `NO` |
| `data[].openTime` | String | **Deprecated** |

> **Doc defects on this page.**
> 1. **Two deprecated fields are still in the schema** — `posLimit` is annotated "(deprecated)"
>    and `openTime` "has been deprecated", yet both appear in the response example. Their
>    replacement, if any, is not stated.
> 2. **The response table carries a stray escape** in front of `supportMarginCoins`
>    (`\>\>supportMarginCoins`), a rendering artefact of the docs table.
> 3. **`deliveryPeriod`'s glosses are loose** — `this_quarter` is "current quarter" and
>    `next_quarter` is "second quarter". For a quarterly product these happen to coincide, but
>    the values are month-coded contracts, so the gloss is a coincidence rather than a definition.
> 4. **Lifecycle timestamps are typed `String` but returned as empty strings** (`deliveryTime`,
>    `deliveryStartTime`, `deliveryPeriod`, `launchTime`, `openTime` all `""` in the perpetual
>    example) rather than `"0"` or `-1` like the other unset markers on the same record. Two
>    different "not applicable" sentinels coexist on one payload; `-1` and `""` must both be
>    handled as absent.
> 5. **`fundInterval`'s enumeration is not stated** — "hourly/every 8 hours" as prose, against a
>    bare hour count in the example (`"8"`), and against the explicit `1, 2, 4, 8` enumeration on
>    [Get Current Funding Rate](#get-current-funding-rate).

---

## Cross-cutting doc defects

Collected here so they are not lost in the per-endpoint sections.

1. **`productType` case is contradicted by Bitget's own examples on 14 of 20 pages.** Every
   parameter table specifies UPPERCASE (`USDT-FUTURES`, `COIN-FUTURES`, `USDC-FUTURES`), but
   nearly every `curl` example sends **lowercase** `productType=usdt-futures`. Only
   [Get Ticker](#get-ticker) and [Get All Tickers](#get-all-tickers) use the uppercase form in
   their examples. This applies to: `merge-depth`, `fills`, `fills-history`, `candles`,
   `history-candles`, `history-index-candles`, `history-mark-candles`, `open-interest`,
   `funding-time`, `symbol-price`, `history-fund-rate`, `current-fund-rate`, `oi-limit`,
   `contracts`. Send the uppercase form the parameter table documents.
2. **Two symbol formats coexist for Coin-M delivery contracts.** The
   [Classic Account](https://www.bitget.com/legacy-docs/classic/intro) page documents
   *pair + month code + 2-digit year* (`BTCUSDH23`, `BTCUSDM23`, `BTCUSDU23`, `BTCUSDZ23`), and
   the ticker examples follow it (`ETHUSDM26`). The [Get All Tickers](#get-all-tickers) example
   instead returns `ETHUSD_231229` (underscore + 6 digits), a format documented nowhere.
3. **Scale conventions are stated per endpoint and are not consistent.** `VIP Fee Rate` spells
   out its four-decimal convention; `Get Current Funding Rate` states a contradictory version of
   the same idea; `Get Discount Rate` and `Get Interest Exchange Rate` state no scale at all for
   their rate fields.
4. **A "N/A" or missing rate limit was found on no page** — all 20 endpoints print one. The
   inconsistency is in *format*, not presence: `Rate limit:`, `Rate Limit:`, `Frequency limit:`
   with and without a space after the colon, `req/sec/IP`, `times/1s (IP)`, and one page
   (`symbol-price`) that uses neither a colon nor a unit.
5. **"Frequency limit" is quoted as printed, not normalised.** Bitget's pages are not
   self-consistent about spacing (`Frequency limit:5 times/1s (IP)` vs
   `Frequency limit: 20 times/1s (IP)` on two otherwise identical lines), so treat the
   surrounding whitespace as meaningless and the number as authoritative.
6. **The sidebar's "Market" link resolves to `Get-VIP-Fee-Rate`,** not to a directory index —
   there is no browsable `.../contract/market/` landing page, so the group root for this file is
   the first endpoint's URL.
7. **`Get History Transactions` names a response field the API never returns** — `idLessThan`'s
   description refers to an `endId` that does not exist in any documented response.

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/03_market.md`
