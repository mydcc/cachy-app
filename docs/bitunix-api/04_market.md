# Market Endpoints

Alle Endpunkte sind **public** Interfaces (keine Authentifizierung nötig).

---

## Get Depth

Quelle: https://www.bitunix.com/api-docs/futures/market/get_depth.html

**Rate Limit**: 10 req/sec/ip

### Description
Interface zum Abrufen des Futures-Orderbuchs.

### HTTP Request
`GET /api/v1/futures/market/depth`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | true     | Trading Pair, basierend auf symbolName, z.B. BTCUSDT |
| limit     | string | false    | Feste Gear-Enum: `1`/`5`/`15`/`50`/`max`. `max` liefert die maximale Gear-Tiefe des Trading Pairs. Wenn die tatsächliche Tiefe das Limit nicht erfüllt, wird gemäß tatsächlicher Gear zurückgegeben |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/depth?symbol=BTCUSDT&limit=max'
```

### Response Parameters
| Parameter      | Type   | Description |
|----------------|--------|-------------|
| asks.index[0]  | string | Ask-Preis |
| asks.index[1]  | string | Ask-Menge |
| bids.index[0]  | string | Bid-Preis |
| bids.index[1]  | string | Bid-Menge |

### Response Example
```json
{"code":0,"data":{"asks":[[0.1001,0.1],[0.1002,10]],"bids":[[0.1,1],[0.0999,10.23]]},"msg":"Success"}
```

---

## Get Funding Rate (Batch)

Quelle: https://www.bitunix.com/api-docs/futures/market/get_funding_rate_batch.html

**Rate Limit**: 10 req/sec/ip

### Description
Ruft die aktuelle Funding Rate für alle Kontrakte ab (Batch).

### HTTP Request
`GET /api/v1/futures/market/funding_rate/batch`

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/funding_rate/batch'
```

### Response Parameters
| Parameter        | Type    | Description |
|------------------|---------|-------------|
| symbol           | string  | Coin Pair |
| markPrice        | decimal | Mark Price |
| lastPrice        | decimal | Last Price |
| indexPrice       | decimal | Index Price |
| fundingRate      | decimal | Aktuelle Funding Rate |
| nextFundingTime  | int64   | Nächste Funding-Abrechnung (ms) |
| fundingInterval  | int32   | Funding-Abrechnungsintervall (Stunden) |
| maxFundingRate   | decimal | Maximale aktuelle Funding Rate |
| minFundingRate   | decimal | Minimale aktuelle Funding Rate |

### Response Example
```json
{"code":0,"data":[{"symbol":"BTCUSDT","markPrice":"60000","lastPrice":"60001","indexPrice":"60001","fundingRate":"0.0005","fundingInterval":8,"nextFundingTime":"1770710400000","maxFundingRate":"0.3","minFundingRate":"-0.3"}],"msg":"Success"}
```

---

## Get Funding Rate History

Quelle: https://www.bitunix.com/api-docs/futures/market/get_funding_rate_history.html

**Rate Limit**: 10 req/sec/ip

### Description
Ruft die historische Funding Rate eines Kontrakts ab.

### HTTP Request
`GET /api/v1/futures/market/get_funding_rate_history`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | true     | Trading Pair, basierend auf symbolName, z.B. BTCUSDT |
| starTime  | int64  | false    | Start-Timestamp (Funding Settle Time), Unix ms, z.B. 1597026383085 |
| endTime   | int64  | false    | End-Timestamp (Funding Settle Time), Unix ms, z.B. 1597026383085 |
| limit     | int32  | false    | Default: 100, Maximum: 200 |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/get_funding_rate_history?symbol=BTCUSDT&limit=10'
```

### Response Parameters
| Parameter    | Type   | Description |
|--------------|--------|-------------|
| markPrice    | string | Mark Price |
| fundingRate  | string | Funding Rate |
| fundingTime  | int64  | Funding Timestamp |

### Response Example
```json
{"code":0,"data":[{"fundingRate":"-0.00001191","fundingTime":"1772449200000","markPrice":"66286.6"}],"msg":"Success"}
```

---

## Get Funding Rate (Single)

Quelle: https://www.bitunix.com/api-docs/futures/market/get_funding_rate.html

**Rate Limit**: 10 req/sec/ip

### Description
Ruft die aktuelle Funding Rate eines einzelnen Kontrakts ab.

### HTTP Request
`GET /api/v1/futures/market/funding_rate`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbol    | string | true     | Trading Pair, basierend auf symbolName, z.B. BTCUSDT |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/funding_rate?symbol=BTCUSDT'
```

### Response Parameters
| Parameter        | Type    | Description |
|------------------|---------|-------------|
| symbol           | string  | Coin Pair |
| markPrice        | decimal | Mark Price |
| lastPrice        | decimal | Last Price |
| indexPrice       | decimal | Index Price |
| fundingRate      | decimal | Aktuelle Funding Rate |
| nextFundingTime  | int64   | Nächste Funding-Abrechnung (ms) |
| fundingInterval  | int32   | Funding-Abrechnungsintervall (Stunden) |
| maxFundingRate   | decimal | Maximale aktuelle Funding Rate |
| minFundingRate   | decimal | Minimale aktuelle Funding Rate |

### Response Example
```json
{"code":0,"data":[{"symbol":"BTCUSDT","markPrice":"60000","lastPrice":"60001","indexPrice":"60001","fundingRate":"0.0005","fundingInterval":8,"nextFundingTime":"1770710400000","maxFundingRate":"0.3","minFundingRate":"-0.3"}],"msg":"Success"}
```

---

## Get Kline

Quelle: https://www.bitunix.com/api-docs/futures/market/get_kline.html

**Rate Limit**: 10 req/sec/ip

### Description
Interface zum Abrufen der historischen Futures-Kline-Daten.

### HTTP Request
`GET /api/v1/futures/market/kline`

### Request Parameters
| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| symbol     | string | true     | Trading Pair, basierend auf symbolName, z.B. BTCUSDT |
| startTime  | int64  | false    | Startzeit: Klines nach diesem Zeitpunkt, Unix ms, z.B. 1672410780000 |
| endTime    | int64  | false    | Endzeit: Klines vor diesem Zeitpunkt, Unix ms, z.B. 1672410780000 |
| interval   | string | true     | Kline-Intervall: `1m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M` |
| limit      | int    | false    | Default: 100, Maximum: 200 |
| type       | string | false    | Kline-Typ: `LAST_PRICE`, `MARK_PRICE`; Default: `LAST_PRICE` |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/kline?symbol=BTCUSDT&startTime=1&endTime=10234&interval=15m'
```

### Response Parameters
| Parameter | Type    | Description |
|-----------|---------|-------------|
| open      | decimal | Eröffnungspreis |
| high      | decimal | Höchstpreis |
| low       | decimal | Tiefstpreis |
| close     | decimal | Schlusspreis |
| quoteVol  | decimal / string | Handelsvolumen (letzte 24h, in Quote-Coin) |
| baseVol   | string  | Handelsvolumen (letzte 24h, in Base-Coin) |

### Response Example
```json
{"code":0,"data":[{"open":60000,"high":60001,"close":60000,"low":59989.2,"time":111111,"quoteVol":"1","baseVol":"60000","type":"LAST_PRICE"}],"msg":"Success"}
```

---

## Get Tickers

Quelle: https://www.bitunix.com/api-docs/futures/market/get_tickers.html

**Rate Limit**: 10 req/sec/ip

### Description
Interface zum Abrufen der Futures Trading Pair Tickers.

### HTTP Request
`GET /api/v1/futures/market/tickers`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbols   | string | false    | Trading Pairs, basierend auf symbolName, z.B. BTCUSDT,ETHUSDT,XRPUSDT |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/tickers?symbols=BTCUSDT,ETHUSDT'
```

### Response Parameters
| Parameter  | Type   | Description |
|------------|--------|-------------|
| symbol     | string | Coin Pair Name, z.B. BTCUSDT |
| markPrice  | string | Mark Price |
| lastPrice  | string | Last Price |
| open       | string | Eröffnungspreis der letzten 24h |
| last       | string | Last Price |
| quoteVol   | string | Handelsvolumen des Coins (letzte 24h) |
| baseVol    | string | Handelsvolumen (letzte 24h) |
| high       | string | 24h Hoch |
| low        | string | 24h Tief |

### Response Example
```json
{"code":0,"data":[{"symbol":"BTCUSDT","markPrice":"57892.1","lastPrice":"57891.2","open":"6.31","last":"6.31","quoteVol":"0","baseVol":"0","high":"6.31","low":"6.31"},{"symbol":"ETHUSDT","markPrice":"2000","lastPrice":"2020.1","open":"6.31","last":"6.31","quoteVol":"0","baseVol":"0","high":"6.31","low":"6.31"}],"msg":"Success"}
```

---

## Get Trading Pairs

Quelle: https://www.bitunix.com/api-docs/futures/market/get_trading_pairs.html

**Rate Limit**: 10 req/sec/ip

### Description
Interface zum Abrufen der Futures Trading Pair Details.

### HTTP Request
`GET /api/v1/futures/market/trading_pairs`

### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| symbols   | string | false    | Trading Pairs, basierend auf symbolName, z.B. BTCUSDT,ETHUSDT,XRPUSDT |

### Request Example
```bash
curl -X 'GET' --location 'https://fapi.bitunix.com/api/v1/futures/market/trading_pairs?symbols=BTCUSDT,ETHUSDT'
```

### Response Parameters
| Parameter             | Type    | Description |
|-----------------------|---------|-------------|
| symbol                | string  | Coin Pair Name, z.B. BTCUSDT |
| base                  | string  | Basiswährung, z.B. ETH bei ETHUSDT |
| quote                 | string  | Quote-Währung, z.B. USDT bei ETHUSDT |
| minTradeVolume        | string  | Minimaler Eröffnungsbetrag (Base-Coin) |
| minBuyPriceOffset     | string  | Minimaler Preis-Offset für Buy-Orders |
| maxSellPriceOffset    | string  | Maximaler Preis-Offset für Sell-Orders |
| maxLimitOrderVolume   | string  | Maximaler Limit-Order-Betrag (Base-Coin) |
| maxMarketOrderVolume  | string  | Maximaler Market-Order-Betrag (Base-Coin) |
| basePrecision         | int     | Max. Präzision des Eröffnungsbetrags |
| quotePrecision        | int     | Max. Präzision des Orderpreises |
| maxLeverage           | int     | Max. Leverage |
| minLeverage           | int     | Min. Leverage |
| defaultLeverage       | int     | Standard-Leverage |
| defaultMarginMode     | string  | Standard Margin Mode: `Isolation` / `Cross` |
| priceProtectScope     | string  | Preis-Schutzbereich. Beispiel: Mark Price = 10000, priceProtectScope=0.02 → min. Sell-Order-Preis = 10000*(1-0.02)=9800; max. Buy-Order-Preis = 10000*(1+0.02)=10200 |
| symbolStatus          | string  | `OPEN`: normaler Handel; `CANCEL_ONLY`: nur Stornierung; `STOP`: keine Positionseröffnung/-schließung möglich |
| isApiSupported        | bool    | `true`: API-Trading aktiviert; `false`: API-Trading deaktiviert |
| maxFundingRate        | decimal | Maximale aktuelle Funding Rate |
| minFundingRate        | decimal | Minimale aktuelle Funding Rate |

### Response Example
```json
{"code":0,"data":[{"symbol":"BTCUSDT","base":"BTC","quote":"USDT","minTradeVolume":"0.0001","minBuyPriceOffset":"-0.95","maxSellPriceOffset":"100","maxLimitOrderVolume":"100000","maxMarketOrderVolume":"50000","basePrecision":4,"quotePrecision":1,"minLeverage":1,"maxLeverage":125,"defaultLeverage":20,"defaultMarginMode":1,"priceProtectScope":"0.02","symbolStatus":"OPEN","isApiSupported":true,"maxFundingRate":"0.3","minFundingRate":"-0.3"}],"msg":"Success"}
```
