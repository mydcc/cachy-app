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

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | true     | Trading pair, based on symbolName, e.g. BTCUSDT |
| starTime  | int64  | false    | Start timestamp (funding settle time), Unix ms, e.g. 1597026383085 |
| endTime   | int64  | false    | End timestamp (funding settle time), Unix ms, e.g. 1597026383085 |
| limit     | int32  | false    | Default: 100, Maximum: 200 |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/get_funding_rate_history?symbol=BTCUSDT&limit=10'
```

### Response Parameters
| Parameter    | Type   | Description |
|--------------|--------|-------------|
| markPrice    | string | Mark price |
| fundingRate  | string | Funding rate (already a fraction, do NOT divide by 100 — unlike the batch endpoint) |
| fundingTime  | int64  | Funding timestamp |

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
| open      | decimal | Opening price |
| high      | decimal | Highest price |
| low       | decimal | Lowest price |
| close     | decimal | Closing price |
| quoteVol  | decimal / string | Trading volume (last 24h, in quote coin) |
| baseVol   | string  | Trading volume (last 24h, in base coin) |

### Response Example
```json
{"code":0,"data":[{"open":60000,"high":60001,"close":60000,"low":59989.2,"time":111111,"quoteVol":"1","baseVol":"60000","type":"LAST_PRICE"}],"msg":"Success"}
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

### Response Example
```json
{"code":0,"data":[{"symbol":"BTCUSDT","markPrice":"57892.1","lastPrice":"57891.2","open":"6.31","last":"6.31","quoteVol":"0","baseVol":"0","high":"6.31","low":"6.31"},{"symbol":"ETHUSDT","markPrice":"2000","lastPrice":"2020.1","open":"6.31","last":"6.31","quoteVol":"0","baseVol":"0","high":"6.31","low":"6.31"}],"msg":"Success"}
```

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

### Response Example
```json
{"code":0,"data":[{"symbol":"BTCUSDT","base":"BTC","quote":"USDT","minTradeVolume":"0.0001","minBuyPriceOffset":"-0.95","maxSellPriceOffset":"100","maxLimitOrderVolume":"100000","maxMarketOrderVolume":"50000","basePrecision":4,"quotePrecision":1,"minLeverage":1,"maxLeverage":125,"defaultLeverage":20,"defaultMarginMode":1,"priceProtectScope":"0.02","symbolStatus":"OPEN","isApiSupported":true,"maxFundingRate":"0.3","minFundingRate":"-0.3"}],"msg":"Success"}
```
