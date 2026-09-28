# WebSocket API

## Prepare / Connection

Source: https://www.bitunix.com/api-docs/futures/websocket/prepare/WebSocket.html

WebSocket is an HTML5 protocol for full-duplex data transmission between
client and server. After a single handshake the server can push data to the
client according to predefined rules. Advantages:

- Header size for data transmission between client/server is only 2 bytes
- Both client and server can initiate data transmission
- No repeated creation/deletion of TCP connections required (saves
  bandwidth and server resources)

### WebSocket Connection Limits
The WebSocket server accepts a maximum of **5 messages per second**.
Messages include:
- PING frames
- PONG frames
- JSON-formatted messages (e.g. subscribe/unsubscribe requests)

If a user exceeds this limit, the connection is disconnected. IPs that are
disconnected repeatedly may be blocked by the server.

### OpenAPI Demo
https://github.com/BitunixOfficial/open-api

It is strongly recommended to use the WebSocket API for market information
and transaction depth.

### Domains

| Domain           | WebSocket API                    | Recommendation |
|------------------|-----------------------------------|----------------|
| WebSocket Domain | `wss://fapi.bitunix.com/public/`  | Main domain, Public Channel |
| WebSocket Domain | `wss://fapi.bitunix.com/private/` | Main domain, Private Channel |

### Ping

#### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| op        | String | Yes      | Operation: `ping` |
| ping      | int64  | Yes      | Unix timestamp in seconds |

Request example:
```json
{
   "op":"ping",
   "ping":1732519687
}
```

Response example:
```json
{
   "op":"ping",
   "pong":1732519687,
   "ping":1732519690
}
```

### Connect
**Subscription Limit**: max. 300 channel subscriptions per connection.

### Subscribe

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| op        | String | Yes      | Operation: `subscribe` |
| args      | Array  | Yes      | List of channels to subscribe to |
| > ch      | String | Yes      | Channel name |
| > symbol  | String | No       | Instrument ID |

Request example:
```json
{
    "op":"subscribe",
    "args":[
        {
            "symbol":"BTCUSDT",
            "ch":"market_kline_1min"
        },
        {
            "symbol":"BTCUSDT",
            "ch":"depth_books"
        }
    ]
}
```

### Unsubscribe

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| op        | String | Yes      | Operation: `unsubscribe` |
| args      | Array  | Yes      | List of channels to unsubscribe from |
| > ch      | String | Yes      | Channel name |
| > symbol  | String | No       | Instrument ID |

Request example:
```json
{
    "op":"unsubscribe",
    "args":[
        {
            "symbol":"BTCUSDT",
            "ch":"market_kline_1min"
        }
    ]
}
```

### Login

#### Request Parameters
| Parameter   | Type   | Required | Description |
|-------------|--------|----------|-------------|
| op          | String | Yes      | Operation: `login` |
| args        | Array  | Yes      | |
| > apiKey    | String | Yes      | API Key |
| > timestamp | Int    | Yes      | Unix timestamp in seconds |
| > nonce     | String | Yes      | Random string |
| > sign      | String | Yes      | Signature string |

Request example:
```json
{
   "op":"login",
   "args":[
         {
              "apiKey":"a91ma19akoo5kjihgvnkllohs61cvdf19v8a65a1a5s61cv6a81va65sdf19v8a65a1",
              "timestamp": 1747402389,
              "nonce":"o9jnhu8ijko2nbhy36fgt0mnjuyhgtsh",
              "sign":"kkogbwoehuoenlbgagogheooeggehn939uh5gelqq33"
          }
    ]
}
```

### Login signature code examples

**Go:**
```go
func Sign() string {
	apiKey := "your-apiKey"
	secretKey := "your-secretKey"
	nonce := "your-nonce"
	timestamp := time.Now().Unix()
	sign := sha256Hash(fmt.Sprintf("%s%d%s", nonce, timestamp, apiKey))
	sign = sha256Hash(fmt.Sprintf("%s%s", sign, secretKey))

	return sign
}

func sha256Hash(input string) string {
	hash := sha256.New()
	hash.Write([]byte(input))
	hashInBytes := hash.Sum(nil)
	hashInHex := hex.EncodeToString(hashInBytes)

	return hashInHex
}
```

**Python:**
```python
import hashlib
import time

def sign():
    api_key = "your-apiKey"
    secret_key = "your-secretKey"
    nonce = "your-nonce"
    timestamp = int(time.time())

    # First SHA-256 hash
    sign = hashlib.sha256((nonce + str(timestamp) + api_key).encode()).hexdigest()

    # Second SHA-256 hash
    sign = hashlib.sha256((sign + secret_key).encode()).hexdigest()

    return sign
```

---

# Private Channels

## Balance Channel

Source: https://www.bitunix.com/api-docs/futures/websocket/private/Balance%20Channel.html

### Description
Balance updates (wire channel: `wallet`).

### Push Parameters
| Parameter         | Type     | Description |
|-------------------|----------|-------------|
| ch                | String   | Channel name: `wallet` |
| ts                | Int64    | Timestamp |
| data              | Object   | |
| > coin            | String   | Coin |
| > available       | String   | Available |
| > frozen          | String   | `frozen = isolationFrozen + crossFrozen` |
| > isolationFrozen | String   | Freeze per warehouse (Isolated) |
| > crossFrozen     | String   | Full-warehouse freeze (Cross) |
| > margin          | String   | Margin |
| > isolationMargin | String   | Margin per warehouse (Isolated) |
| > crossMargin     | String   | Full-warehouse margin (Cross) |
| > expMoney        | String   | Experience Money |

---

## Order Channel

Source: https://www.bitunix.com/api-docs/futures/websocket/private/Order%20Channel.html

### Description
Subscribes to the order channel. Data is pushed on the following events:
1. Open/close orders are created
2. Open/close orders are filled
3. Orders are cancelled

### Push Parameters
| Parameter      | Type   | Description |
|----------------|--------|-------------|
| ch             | String | Channel name: `order` |
| ts             | Int64  | Timestamp |
| data           | Object | Subscription data |
| > event        | String | `CREATE`/`UPDATE`/`CLOSE` |
| > orderId      | String | Order ID |
| > symbol       | String | Symbol |
| > positionType | String | Margin mode: `ISOLATION`/`CROSS` |
| > positionMode | String | Position mode: `ONE_WAY`/`HEDGE` |
| > side         | String | `BUY`/`SELL` |
| > effect       | String | Validity period: `IOC`, `FOK`, `GTC` (default), `POST_ONLY` |
| > type         | String | `LIMIT`/`MARKET` |
| > qty          | String | Quantity (base coin) |
| > price        | String | Order price (required for `LIMIT`) |
| > ctime        | String | Creation timestamp |
| > mtime        | String | Modification timestamp |
| > leverage     | String | Leverage |
| > orderStatus  | String | `INIT`, `NEW`, `PART_FILLED`, `CANCELED`, `FILLED`, `PART_FILLED_CANCELED` |
| > fee          | String | Deducted trading fees |
| > averagePrice | String | Average price |
| > dealAmount   | String | Filled amount |
| > clientId     | String | Client ID |
| > tpStopType   | String | Take-profit trigger type: `MARK_PRICE`/`LAST_PRICE` |
| > tpPrice      | String | Take-profit trigger price |
| > tpOrderType  | String | Take-profit order type: `LIMIT`/`MARKET` |
| > tpOrderPrice | String | Take-profit order price |
| > slStopType   | String | Stop-loss trigger type: `MARK_PRICE`/`LAST_PRICE` |
| > slPrice      | String | Stop-loss trigger price |
| > slOrderType  | String | Stop-loss order type: `LIMIT`/`MARKET` |
| > slOrderPrice | String | Stop-loss order price |

---

## Position Channel

Source: https://www.bitunix.com/api-docs/futures/websocket/private/Position%20Channel.html

### Description
Subscribes to the position channel. Data is pushed on the following events:
1. Open/close orders are created
2. Open/close orders are filled
3. Orders are cancelled

### Push Parameters
| Parameter       | Type   | Description |
|-----------------|--------|-------------|
| ch              | String | Channel name: `position` |
| ts              | Int64  | Timestamp |
| data            | Object | Subscription data |
| > event         | String | `OPEN`/`UPDATE`/`CLOSE` |
| > positionId    | String | Position ID |
| > marginMode    | String | Margin mode: `ISOLATION`/`CROSS` |
| > positionMode  | String | Position mode: `ONE_WAY`/`HEDGE` |
| > side          | String | Position direction: `SHORT`/`LONG` |
| > leverage      | String | Leverage |
| > margin        | String | Margin |
| > ctime         | String | Creation timestamp |
| > qty           | String | Position size |
| > symbol        | String | Symbol |
| > realizedPNL   | String | Realised PnL (excl. funding fee and trading fee) |
| > unrealizedPNL | String | Unrealised PnL |
| > funding       | String | Total funding fee during the position |
| > fee           | String | Deducted trading fees |

---

## Tp Sl Channel

Source: https://www.bitunix.com/api-docs/futures/websocket/private/Tp%20Sl%20Channel.html

### Description
TP/SL order updates (wire channel: `tp_sl`).

### Push Parameters
| Parameter      | Type   | Description |
|----------------|--------|-------------|
| ch             | String | Channel name: `tp_sl` |
| ts             | Int64  | Timestamp |
| data           | Object | Subscription data |
| > event        | String | `CREATE`/`UPDATE`/`CLOSE` |
| > positionId   | String | Position ID |
| > orderId      | String | Order ID |
| > symbol       | String | Symbol |
| > leverage     | String | Leverage |
| > side         | String | `BUY`/`SELL` |
| > positionMode | String | Position mode: `ONE_WAY`/`HEDGE` |
| > status       | String | `INIT`, `NEW`, `PART_FILLED`, `CANCELED`, `FILLED` |
| > ctime        | String | Creation timestamp |
| > type         | String | `LIMIT`/`MARKET` |
| > tpQty        | String | Take-profit quantity (base coin). At least one of `tpQty`/`slQty` is required |
| > slQty        | String | Stop-loss quantity (base coin). At least one of `tpQty`/`slQty` is required |
| > tpStopType   | String | Take-profit trigger type: `MARK_PRICE`/`LAST_PRICE` |
| > tpPrice      | String | Take-profit trigger price |
| > tpOrderType  | String | Take-profit order type: `LIMIT`/`MARKET` |
| > tpOrderPrice | String | Take-profit order price |
| > slStopType   | String | Stop-loss trigger type: `MARK_PRICE`/`LAST_PRICE` |
| > slPrice      | String | Stop-loss trigger price |
| > slOrderType  | String | Stop-loss order type: `LIMIT`/`MARKET` |
| > slOrderPrice | String | Stop-loss order price |

---

# Public Channels

## Depth Channel

Source: https://www.bitunix.com/api-docs/futures/websocket/public/depth%20channel.html

### Description
Use `books` for snapshot data, `book1` for 1 depth level, `book5` for 5 depth
levels, `book15` for 15 depth levels.

- `books`: Push of the complete `snapshot` data the first time, then all
  changes of the depth.
- `book1`: 1 depth level is transmitted with every push.
- `book5`: 5 depth levels are transmitted with every push.
- `book15`: 15 depth levels are transmitted with every push.

### Request Parameters
| Parameter | Type         | Required | Description |
|-----------|--------------|----------|-------------|
| op        | String       | Yes      | Operation: `subscribe`/`unsubscribe` |
| args      | List<Object> | Yes      | List of channels to subscribe to |
| > ch      | String       | Yes      | Channel name: `depth_books`, `depth_book1`, `depth_book5`, `depth_book15` |
| > symbol  | String       | Yes      | Product ID |

Request example:
```json
{
    "op":"subscribe",
    "args":[
        {
            "symbol":"BTCUSDT",
            "ch":"depth_book1"
        }
    ]
}
```

### Push Parameters
| Parameter | Type         | Description |
|-----------|--------------|-------------|
| ch        | Object       | Channel name |
| symbol    | String       | Product ID |
| ts        | Int64        | Timestamp |
| data      | String       | Subscription data |
| > a       | List<String> | Seller depth (asks) |
| > b       | List<String> | Buyer depth (bids) |

Push data example:
```json
{
  "ch": "depth_book1",
  "symbol": "BTCUSDT",
  "ts": 1775541541009,
  "data":{
        "b":[
             [
                  "7403.89",
                  "0.002"
             ]
            ],
        "a": [
             [
                 "7405.96",
                 "3.340"
             ]
        ]
   }
}
```

---

## Kline Channel

Source: https://www.bitunix.com/api-docs/futures/websocket/public/kline%20channel.html

### Description
Retrieves candlestick data of a symbol. Data is pushed every 500ms.

The channel pushes an initial snapshot after a successful subscription,
followed by further updates.

> **Note**: To switch the K-line interval without disconnecting the WebSocket
> connection, an `unsubscribe` command for the previous subscription must be
> sent first, before the new interval is subscribed. If, for example, you are
> currently subscribed to `mark_kline_1min` and want to switch to
> `mark_kline_15min`, you must first unsubscribe from `mark_kline_1min` and
> then subscribe to `mark_kline_15min`.

### Request Parameters
| Parameter | Type         | Required | Description |
|-----------|--------------|----------|-------------|
| op        | String       | Yes      | Operation: `subscribe`/`unsubscribe` |
| args      | List<Object> | Yes      | List of channels to subscribe to |
| > ch      | String       | Yes      | Channel name: `<PriceType>_kline_<Interval>`. Price types: `market` (market price) and `mark` (mark price). Venue-documented intervals: `1min, 3min, 5min, 15min, 30min, 60min, 2h, 4h, 6h, 8h, 12h, 1day, 3day, 1week, 1month` (each for both price types). Cachy natively subscribes `market_kline_*` for `1min, 5min, 15min, 30min, 60min, 4h, 1day, 1week, 1month` and synthesizes the rest (see `timeframes.md`); `mark_*` is never subscribed. |
| > symbol  | String       | Yes      | Product ID, e.g. ETHUSDT |

Request example:
```json
{
    "op":"subscribe",
    "args":[
        {
            "symbol":"BTCUSDT",
            "ch":"market_kline_1min"
        }
    ]
}
```

### Push Parameters
| Parameter | Type         | Description |
|-----------|--------------|-------------|
| ch        | String       | Channel name |
| symbol    | String       | Product ID, e.g. ETHUSDT |
| ts        | int64        | Timestamp |
| data      | List<String> | Subscription data |
| > o       | String       | Opening price |
| > h       | String       | Highest price |
| > l       | String       | Lowest price |
| > c       | String       | Closing price |
| > b       | String       | Trading volume of the coin |
| > q       | String       | Trading volume of the quote currency |

Push data example:
```json
{
  "ch": "market_kline_1min",
  "symbol": "BTCUSDT",
  "ts": 1775541412718,
  "data":{
      "o": "68581.4",
      "c": "68583.4",
      "h": "68590",
      "l": "68579.5",
      "b": "5.2395",
      "q": "359348.14078"
  }
}
```

---

## MarketPrice Channel

Source: https://www.bitunix.com/api-docs/futures/websocket/public/MarketPrice%20Channel.html

### Request Parameters
| Parameter | Type         | Required | Description |
|-----------|--------------|----------|-------------|
| op        | String       | Yes      | Operation: `subscribe`/`unsubscribe` |
| args      | List<Object> | Yes      | |
| > symbol  | String       | Yes      | Product ID, e.g. ETHUSDT |
| > ch      | String       | Yes      | Channel: `price` |

Request example:
```json
{
    "op":"subscribe",
    "args":[
        {
            "symbol":"BTCUSDT",
            "ch":"price"
        }
    ]
}
```

### Push Parameters
| Parameter | Type         | Description |
|-----------|--------------|-------------|
| ch        | String       | Channel name |
| symbol    | String       | Product ID, e.g. ETHUSDT |
| ts        | int64        | Timestamp |
| data      | List<String> | Subscription data |
| > mp      | String       | Market Price |
| > ip      | String       | Index Price |
| > fr      | String       | Funding Rate |
| > ft      | String       | Funding Rate Settlement Time |
| > nft     | String       | Next Funding Rate Settlement Time |

Push data example:
```json
{
  "ch": "price",
  "symbol": "BNBUSDT",
  "ts": 1732178884994,
  "data":{
        "ip": "0.0010",
        "mp": "10000",
        "fr": "0.013461",
        "ft": "2024-12-04T11:00:00Z",
        "nft": "2024-12-04T12:00:00Z"
   }
}
```

---

## Ticker Channel

Source: https://www.bitunix.com/api-docs/futures/websocket/public/Ticker%20Channel.html

### Description
24h rolling window mini-ticker statistics for all symbols. These are
**not** UTC daily statistics, but a 24h rolling window from request time
back 24h.

### Request Parameters
| Parameter | Type         | Required | Description |
|-----------|--------------|----------|-------------|
| op        | String       | Yes      | Operation: `subscribe`/`unsubscribe` |
| args      | List<Object> | Yes      | |
| > symbol  | String       | Yes      | Product ID, e.g. ETHUSDT |
| > ch      | String       | Yes      | Channel: `ticker` |

Request example:
```json
{
    "op":"subscribe",
    "args":[
        {
            "symbol":"BTCUSDT",
            "ch":"ticker"
        }
    ]
}
```

### Push Parameters
| Parameter | Type         | Description |
|-----------|--------------|-------------|
| ch        | String       | Channel name |
| symbol    | String       | Product ID, e.g. ETHUSDT |
| ts        | int64        | Timestamp |
| data      | List<String> | Subscription data |
| > s       | String       | Symbol, Product ID, e.g. ETHUSDT |
| > o       | String       | Opening price |
| > h       | String       | Highest price |
| > l       | String       | Lowest price |
| > la      | String       | Last Price |
| > b       | String       | Trading volume of the coin |
| > q       | String       | Trading volume of the quote currency |
| > r       | String       | 24h change |

Push data example:
```json
{
  "ch": "ticker",
  "symbol": "BNBUSDT",
  "ts": 1732178884994,
  "data":{
    "s": "BTCUSDT",
    "la": "68650.9",
    "o": "69141.6",
    "h": "70319.9",
    "l": "68241.9",
    "b": "26295.3977",
    "q": "1823374525.0193",
    "r": "-0.7097029863"
   }
}
```

---

## Tickers Channel

Source: https://www.bitunix.com/api-docs/futures/websocket/public/Tickers%20Channel.html

### Description
24h rolling window mini-ticker statistics for all symbols (aggregated stream,
different data structure compared to the individual ticker subscription).
These statistics are not based on UTC daily data, but on a 24h rolling window
backwards from the request time.

### Request Parameters
| Parameter | Type         | Required | Description |
|-----------|--------------|----------|-------------|
| op        | String       | Yes      | Operation: `subscribe`/`unsubscribe` |
| args      | List<Object> | Yes      | |
| > symbol  | String       | Yes      | Product ID, e.g. ETHUSDT |
| > ch      | String       | Yes      | Channel: `tickers` |

Request example:
```json
{
	"op": "subscribe",
	"args": [{
			"symbol": "BTCUSDT",
			"ch": "tickers"
		},
		{
			"symbol": "ETHUSDT",
			"ch": "tickers"
		}
	]
}
```

### Push Parameters
| Parameter | Type         | Description |
|-----------|--------------|-------------|
| ch        | String       | Channel name |
| ts        | int64        | Timestamp |
| data      | List<Object> | Subscription data (array per symbol) |
| > s       | String       | Symbol, Product ID, e.g. ETHUSDT |
| > o       | String       | Opening price |
| > h       | String       | Highest price |
| > l       | String       | Lowest price |
| > la      | String       | Last Price |
| > b       | String       | Trading volume of the coin |
| > q       | String       | Trading volume of the quote currency |
| > r       | String       | 24h change |
| > bd      | String       | Best Bid Price |
| > ak      | String       | Best Ask Price |
| > bv      | String       | Best Bid Volume |
| > av      | String       | Best Ask Volume |

Push data example:
```json
{
  "ch": "tickers",
  "ts": 1732178884994,
  "data":[
    {
        "s": "BTCUSDT",
        "la": "68650.9",
        "o": "69141.6",
        "h": "70319.9",
        "l": "68241.9",
        "b": "26295.3977",
        "q": "1823374525.0193",
        "r": "-0.7097029863",
        "bd":"68650.9",
        "ak":"68651",
        "bv":"0.9747",
        "av":"2.3606"
   },
   {
        "s": "ETHUSDT",
        "la": "2104.61",
        "o": "2128.49",
        "h": "2173.75",
        "l": "2086.79",
        "b": "945498.652",
        "q": "2018286647.13588",
        "r":"-1.1219221138",
        "bd":"2104.6",
        "ak":"2104.61",
        "bv":"27.789",
        "av":"7.905"
   }
  ]
}
```

---

## Trade Channel

Source: https://www.bitunix.com/api-docs/futures/websocket/public/Trade%20Channel.html

### Description
Delivers public trade data.

### Request Parameters
| Parameter | Type         | Required | Description |
|-----------|--------------|----------|-------------|
| op        | String       | Yes      | Operation: `subscribe`/`unsubscribe` |
| args      | List<Object> | Yes      | |
| > symbol  | String       | Yes      | Product ID, e.g. ETHUSDT |
| > ch      | String       | Yes      | Channel: `trade` |

Request example:
```json
{
    "op":"subscribe",
    "args":[
        {
            "symbol":"BTCUSDT",
            "ch":"trade"
        }
    ]
}
```

### Push Parameters
| Parameter | Type         | Description |
|-----------|--------------|-------------|
| ch        | String       | Channel: `trade` |
| symbol    | String       | Symbol: ETHUSDT |
| ts        | String       | Timestamp |
| data      | List<Object> | Data |
| > p       | String       | Execution price |
| > v       | String       | Execution quantity |
| > s       | String       | Execution side: `sell`/`buy` |
| > t       | String       | Timestamp (venue sends ISO-8601, e.g. `2026-04-07T05:47:52Z`; Cachy normalizes to epoch ms `number` in `TradeData.t`) |

Push data example:
```json
{
  "ch": "trade",
  "symbol": "BTCUSDT",
  "ts": 1775540872598,
  "data": [
        {
            "t": "2026-04-07T05:47:52Z",
            "p": "68621.4",
            "v": "0.7142",
            "s": "buy"
        },
        {
            "t": "2026-04-07T05:47:52Z",
            "p": "68621.4",
            "v": "0.0018",
            "s": "sell"
        }
    ]
}
```

---

## What Cachy subscribes to

This file documents the full exchange surface. Cachy wires a subset:

- Public: `ticker`, `trade`, `depth_book5`, `market_kline_*` (natively for `1min, 5min, 15min, 30min, 60min, 4h, 1day, 1week, 1month`; the rest synthesized — see `timeframes.md`), `price`. `mark_kline_*`, `tickers` batch, `depth_books/book1/book15` are intentionally unwired.
- Private: `position`, `order`, `wallet`, `tp_sl` (see Private Channels above).
- Funding rate: REST batch returns percent and is divided by 100 in `apiService.fetchBitunixFundingRates`; WS `price.fr` is normalized at the same single site — see `QUICK_REFERENCE.md`.
