# WebSocket API

## Prepare / Verbindung

Quelle: https://www.bitunix.com/api-docs/futures/websocket/prepare/WebSocket.html

WebSocket ist ein HTML5-Protokoll für Vollduplex-Datenübertragung zwischen
Client und Server. Nach nur einem Handshake kann der Server Daten gemäß
vordefinierter Regeln an den Client pushen. Vorteile:

- Header-Größe für Datenübertragung zwischen Client/Server nur 2 Bytes
- Sowohl Client als auch Server können Datenübertragung initiieren
- Kein wiederholtes Erstellen/Löschen von TCP-Verbindungen nötig (spart
  Bandbreite und Serverressourcen)

### WebSocket Connection Limits
Der WebSocket-Server akzeptiert maximal **5 Nachrichten pro Sekunde**.
Nachrichten umfassen:
- PING-Frames
- PONG-Frames
- JSON-formatierte Nachrichten (z.B. Subscribe-/Unsubscribe-Requests)

Wenn ein Nutzer diese Grenze überschreitet, wird die Verbindung getrennt. IPs,
die wiederholt getrennt werden, können vom Server blockiert werden.

### OpenAPI Demo
https://github.com/BitunixOfficial/open-api

Es wird dringend empfohlen, die WebSocket-API für Marktinformationen und
Transaktionstiefe zu nutzen.

### Domains

| Domain           | WebSocket API                    | Empfehlung |
|------------------|-----------------------------------|------------|
| WebSocket Domain | `wss://fapi.bitunix.com/public/`  | Hauptdomain, Public Channel |
| WebSocket Domain | `wss://fapi.bitunix.com/private/` | Hauptdomain, Private Channel |

### Ping

#### Request Parameters
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| op        | String | Yes      | Operation: `ping` |
| ping      | int64  | Yes      | Unix-Timestamp in Sekunden |

Request-Beispiel:
```json
{
   "op":"ping",
   "ping":1732519687
}
```

Response-Beispiel:
```json
{
   "op":"ping",
   "pong":1732519687,
   "ping":1732519690
}
```

### Connect
**Subscription Limit**: max. 300 Channel-Abonnements pro Verbindung.

### Subscribe

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| op        | String | Yes      | Operation: `subscribe` |
| args      | Array  | Yes      | Liste der zu abonnierenden Channels |
| > ch      | String | Yes      | Channel-Name |
| > symbol  | String | No       | Instrument ID |

Request-Beispiel:
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
| args      | Array  | Yes      | Liste der zu deabonnierenden Channels |
| > ch      | String | Yes      | Channel-Name |
| > symbol  | String | No       | Instrument ID |

Request-Beispiel:
```json
{
    "op":"unsubscribe",
    "args":[
        {
            "symbol":"BTCUSDT",
            "channel":"market_kline_1min"
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
| > timestamp | Int    | Yes      | Unix-Timestamp in Sekunden |
| > nonce     | String | Yes      | Zufälliger String |
| > sign      | String | Yes      | Signatur-String |

Request-Beispiel:
```json
{
   "op":"login",
   "args":[
         {
             "apiKey":"a91ma19akoo5kjihgvnkllohs61cvdf19v8a65a1a5s61cv6a81va65sdf19v8a65a1",
             "timestamp": 1747402389682,
             "nonce":"o9jnhu8ijko2nbhy36fgt0mnjuyhgtsh",
             "sign":"kkogbwoehuoenlbgagogheooeggehn939uh5gelqq33"
         }
   ]
}
```

### Signatur-Code-Beispiele für Login

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

Quelle: https://www.bitunix.com/api-docs/futures/websocket/private/Balance%20Channel.html

### Description
Balance-Updates.

### Push Parameters
| Parameter         | Type     | Description |
|-------------------|----------|-------------|
| ch                | String   | Channel-Name: `position` |
| ts                | Int64    | Timestamp |
| data              | Object   | |
| > coin            | String   | Coin |
| > available       | String   | Verfügbar |
| > frozen          | String   | `frozen = isolationFrozen + crossFrozen` |
| > isolationFrozen | String   | Sperrung pro Warehouse (Isolation) |
| > crossFrozen     | String   | Full-Warehouse-Sperrung (Cross) |
| > margin          | String   | Margin |
| > isolationMargin | String   | Margin pro Warehouse (Isolation) |
| > crossMargin     | String   | Full-Warehouse-Margin (Cross) |
| > expMoney        | String   | Experience Money |

---

## Order Channel

Quelle: https://www.bitunix.com/api-docs/futures/websocket/private/Order%20Channel.html

### Description
Abonniert den Order-Channel. Daten werden gepusht bei folgenden Events:
1. Open/Close-Orders werden erstellt
2. Open/Close-Orders werden ausgeführt (filled)
3. Orders werden storniert

### Push Parameters
| Parameter      | Type   | Description |
|----------------|--------|-------------|
| ch             | String | Channel-Name: `position` |
| ts             | Int64  | Timestamp |
| data           | Object | Subscription-Daten |
| > event        | String | `CREATE`/`UPDATE`/`CLOSE` |
| > orderId      | String | Order ID |
| > symbol       | String | Symbol |
| > positionType | String | Margin Mode: `ISOLATION`/`CROSS` |
| > positionMode | String | Position Mode: `ONE_WAY`/`HEDGE` |
| > side         | String | `BUY`/`SELL` |
| > effect       | String | Gültigkeitsdauer: `IOC`, `FOK`, `GTC` (Default), `POST_ONLY` |
| > type         | String | `LIMIT`/`MARKET` |
| > qty          | String | Menge (Base-Coin) |
| > price        | String | Orderpreis (erforderlich bei `LIMIT`) |
| > ctime        | String | Erstell-Timestamp |
| > mtime        | String | Änderungs-Timestamp |
| > leverage     | String | Leverage |
| > orderStatus  | String | `INIT`, `NEW`, `PART_FILLED`, `CANCELED`, `FILLED`, `PART_FILLED_CANCELED` |
| > fee          | String | Abgezogene Handelsgebühren |
| > averagePrice | String | Durchschnittspreis |
| > dealAmount   | String | Ausgeführter Betrag |
| > clientId     | String | Client ID |
| > tpStopType   | String | Take-Profit-Trigger-Typ: `MARK_PRICE`/`LAST_PRICE` |
| > tpPrice      | String | Take-Profit-Trigger-Preis |
| > tpOrderType  | String | Take-Profit-Order-Typ: `LIMIT`/`MARKET` |
| > tpOrderPrice | String | Take-Profit-Order-Preis |
| > slStopType   | String | Stop-Loss-Trigger-Typ: `MARK_PRICE`/`LAST_PRICE` |
| > slPrice      | String | Stop-Loss-Trigger-Preis |
| > slOrderType  | String | Stop-Loss-Order-Typ: `LIMIT`/`MARKET` |
| > slOrderPrice | String | Stop-Loss-Order-Preis |

---

## Position Channel

Quelle: https://www.bitunix.com/api-docs/futures/websocket/private/Position%20Channel.html

### Description
Abonniert den Position-Channel. Daten werden gepusht bei folgenden Events:
1. Open/Close-Orders werden erstellt
2. Open/Close-Orders werden ausgeführt (filled)
3. Orders werden storniert

### Push Parameters
| Parameter       | Type   | Description |
|-----------------|--------|-------------|
| ch              | String | Channel-Name: `position` |
| ts              | Int64  | Timestamp |
| data            | Object | Subscription-Daten |
| > event         | String | `OPEN`/`UPDATE`/`CLOSE` |
| > positionId    | String | Position ID |
| > marginMode    | String | Margin Mode: `ISOLATION`/`CROSS` |
| > positionMode  | String | Position Mode: `ONE_WAY`/`HEDGE` |
| > side          | String | Positions-Richtung: `SHORT`/`LONG` |
| > leverage      | String | Leverage |
| > margin        | String | Margin |
| > ctime         | String | Erstell-Timestamp |
| > qty           | String | Positionsgröße |
| > symbol        | String | Symbol |
| > realizedPNL   | String | Realized PnL (exkl. Funding Fee und Handelsgebühr) |
| > unrealizedPNL | String | Unrealized PnL |
| > funding       | String | Gesamte Funding Fee während der Position |
| > fee           | String | Abgezogene Handelsgebühren |

---

## Tp Sl Channel

Quelle: https://www.bitunix.com/api-docs/futures/websocket/private/Tp%20Sl%20Channel.html

### Description
TP/SL-Order-Updates.

### Push Parameters
| Parameter      | Type   | Description |
|----------------|--------|-------------|
| ch             | String | Channel-Name: `position` |
| ts             | Int64  | Timestamp |
| data           | Object | Subscription-Daten |
| > event        | String | `CREATE`/`UPDATE`/`CLOSE` |
| > positionId   | String | Position ID |
| > orderId      | String | Order ID |
| > symbol       | String | Symbol |
| > leverage     | String | Leverage |
| > side         | String | `BUY`/`SELL` |
| > positionMode | String | Position Mode: `ONE_WAY`/`HEDGE` |
| > status       | String | `INIT`, `NEW`, `PART_FILLED`, `CANCELED`, `FILLED` |
| > ctime        | String | Erstell-Timestamp |
| > type         | String | `LIMIT`/`MARKET` |
| > tpQty        | String | Take-Profit-Menge (Base-Coin). Mind. eines von `tpQty`/`slQty` erforderlich |
| > slQty        | Bool   | Stop-Loss-Menge (Base-Coin). Mind. eines von `tpQty`/`slQty` erforderlich |
| > tpStopType   | String | Take-Profit-Trigger-Typ: `MARK_PRICE`/`LAST_PRICE` |
| > tpPrice      | String | Take-Profit-Trigger-Preis |
| > tpOrderType  | String | Take-Profit-Order-Typ: `LIMIT`/`MARKET` |
| > tpOrderPrice | String | Take-Profit-Order-Preis |
| > slStopType   | String | Stop-Loss-Trigger-Typ: `MARK_PRICE`/`LAST_PRICE` |
| > slPrice      | String | Stop-Loss-Trigger-Preis |
| > slOrderType  | String | Stop-Loss-Order-Typ: `LIMIT`/`MARKET` |
| > slOrderPrice | String | Stop-Loss-Order-Preis |

---

# Public Channels

## Depth Channel

Quelle: https://www.bitunix.com/api-docs/futures/websocket/public/depth%20channel.html

### Description
Nutze `books` für Snapshot-Daten, `book1` für 1 Tiefenlevel, `book5` für 5
Tiefenlevel, `book15` für 15 Tiefenlevel.

- `books`: Push der vollständigen `snapshot`-Daten beim ersten Mal, danach
  alle Änderungen der Tiefe.
- `book1`: 1 Tiefenlevel wird bei jedem Push übertragen.
- `book5`: 5 Tiefenlevel werden bei jedem Push übertragen.
- `book15`: 15 Tiefenlevel werden bei jedem Push übertragen.

### Request Parameters
| Parameter | Type         | Required | Description |
|-----------|--------------|----------|-------------|
| op        | String       | Yes      | Operation: `subscribe`/`unsubscribe` |
| args      | List<Object> | Yes      | Liste der zu abonnierenden Channels |
| > ch      | String       | Yes      | Channel-Name: `depth_books`, `depth_book1`, `depth_book5`, `depth_book15` |
| > symbol  | String       | Yes      | Product ID |

Request-Beispiel:
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
| ch        | Object       | Channel-Name |
| symbol    | String       | Product ID |
| ts        | Int64        | Timestamp |
| data      | String       | Subscription-Daten |
| > a       | List<String> | Seller-Tiefe (Asks) |
| > b       | List<String> | Buyer-Tiefe (Bids) |

Push-Daten-Beispiel:
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

Quelle: https://www.bitunix.com/api-docs/futures/websocket/public/kline%20channel.html

### Description
Ruft Candlestick-Daten eines Symbols ab. Daten werden alle 500ms gepusht.

Der Channel pusht nach erfolgreichem Abonnement zunächst einen Snapshot,
gefolgt von weiteren Updates.

> **Hinweis**: Um K-Line-Intervalle zu wechseln, ohne die WebSocket-Verbindung
> zu trennen, muss zuerst ein `unsubscribe`-Befehl für das vorherige
> Abonnement gesendet werden, bevor das neue Intervall abonniert wird. Wenn
> du z.B. aktuell `mark_kline_1min` abonniert hast und zu `mark_kline_15min`
> wechseln willst, musst du zuerst `mark_kline_1min` deabonnieren und dann
> `mark_kline_15min` abonnieren.

### Request Parameters
| Parameter | Type         | Required | Description |
|-----------|--------------|----------|-------------|
| op        | String       | Yes      | Operation: `subscribe`/`unsubscribe` |
| args      | List<Object> | Yes      | Liste der zu abonnierenden Channels |
| > ch      | String       | Yes      | Channel-Name: `<Preistyp>_kline_<Intervall>`. Preistypen: `market` (Marktpreis) und `mark` (Mark-Preis). Verfügbare Intervalle: `1min, 3min, 5min, 15min, 30min, 60min, 2h, 4h, 6h, 8h, 12h, 1day, 3day, 1week, 1month` (jeweils für beide Preistypen, z.B. `market_kline_1min`, `mark_kline_1min`, `market_kline_3min`, `mark_kline_3min` usw.) |
| > symbol  | String       | Yes      | Product ID, z.B. ETHUSDT |

Request-Beispiel:
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
| ch        | String       | Channel-Name |
| symbol    | String       | Product ID, z.B. ETHUSDT |
| ts        | int64        | Timestamp |
| data      | List<String> | Subscription-Daten |
| > o       | String       | Eröffnungspreis |
| > h       | String       | Höchstpreis |
| > l       | String       | Tiefstpreis |
| > c       | String       | Schlusspreis |
| > b       | String       | Handelsvolumen des Coins |
| > q       | String       | Handelsvolumen der Quote-Währung |

Push-Daten-Beispiel:
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

Quelle: https://www.bitunix.com/api-docs/futures/websocket/public/MarketPrice%20Channel.html

### Request Parameters
| Parameter | Type         | Required | Description |
|-----------|--------------|----------|-------------|
| op        | String       | Yes      | Operation: `subscribe`/`unsubscribe` |
| args      | List<Object> | Yes      | |
| > symbol  | String       | Yes      | Product ID, z.B. ETHUSDT |
| > ch      | String       | Yes      | Channel: `price` |

Request-Beispiel:
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
| ch        | String       | Channel-Name |
| symbol    | String       | Product ID, z.B. ETHUSDT |
| ts        | int64        | Timestamp |
| data      | List<String> | Subscription-Daten |
| > mp      | String       | Market Price |
| > ip      | String       | Index Price |
| > fr      | String       | Funding Rate |
| > ft      | String       | Funding Rate Settlement Time |
| > nft     | String       | Nächste Funding Rate Settlement Time |

Push-Daten-Beispiel:
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

Quelle: https://www.bitunix.com/api-docs/futures/websocket/public/Ticker%20Channel.html

### Description
24h-Rolling-Window Mini-Ticker-Statistiken für alle Symbole. Dies sind
**keine** UTC-Tages-Statistiken, sondern ein 24h-Rolling-Window von
Request-Zeit bis 24h davor.

### Request Parameters
| Parameter | Type         | Required | Description |
|-----------|--------------|----------|-------------|
| op        | String       | Yes      | Operation: `subscribe`/`unsubscribe` |
| args      | List<Object> | Yes      | |
| > symbol  | String       | Yes      | Product ID, z.B. ETHUSDT |
| > ch      | String       | Yes      | Channel: `ticker` |

Request-Beispiel:
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
| ch        | String       | Channel-Name |
| symbol    | String       | Product ID, z.B. ETHUSDT |
| ts        | int64        | Timestamp |
| data      | List<String> | Subscription-Daten |
| > s       | String       | Symbol, Product ID, z.B. ETHUSDT |
| > o       | String       | Eröffnungspreis |
| > h       | String       | Höchstpreis |
| > l       | String       | Tiefstpreis |
| > la      | String       | Last Price |
| > b       | String       | Handelsvolumen des Coins |
| > q       | String       | Handelsvolumen der Quote-Währung |
| > r       | String       | 24h-Schwankung |

Push-Daten-Beispiel:
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

Quelle: https://www.bitunix.com/api-docs/futures/websocket/public/Tickers%20Channel.html

### Description
24h-Rolling-Window Mini-Ticker-Statistiken für alle Symbole (aggregierter
Stream, andere Datenstruktur im Vergleich zum einzelnen Ticker-Abonnement).
Diese Statistiken basieren nicht auf UTC-Tagesdaten, sondern auf einem
24h-Rolling-Window von der Request-Zeit rückwärts.

### Request Parameters
| Parameter | Type         | Required | Description |
|-----------|--------------|----------|-------------|
| op        | String       | Yes      | Operation: `subscribe`/`unsubscribe` |
| args      | List<Object> | Yes      | |
| > symbol  | String       | Yes      | Product ID, z.B. ETHUSDT |
| > ch      | String       | Yes      | Channel: `tickers` |

Request-Beispiel:
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
| ch        | String       | Channel-Name |
| ts        | int64        | Timestamp |
| data      | List<Object> | Subscription-Daten (Array pro Symbol) |
| > s       | String       | Symbol, Product ID, z.B. ETHUSDT |
| > o       | String       | Eröffnungspreis |
| > h       | String       | Höchstpreis |
| > l       | String       | Tiefstpreis |
| > la      | String       | Last Price |
| > b       | String       | Handelsvolumen des Coins |
| > q       | String       | Handelsvolumen der Quote-Währung |
| > r       | String       | 24h-Schwankung |
| > bd      | String       | Best Bid Price |
| > ak      | String       | Best Ask Price |
| > bv      | String       | Best Bid Volume |
| > av      | String       | Best Ask Volume |

Push-Daten-Beispiel:
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

Quelle: https://www.bitunix.com/api-docs/futures/websocket/public/Trade%20Channel.html

### Description
Liefert öffentliche Trade-Daten.

### Request Parameters
| Parameter | Type         | Required | Description |
|-----------|--------------|----------|-------------|
| op        | String       | Yes      | Operation: `subscribe`/`unsubscribe` |
| args      | List<Object> | Yes      | |
| > symbol  | String       | Yes      | Product ID, z.B. ETHUSDT |
| > ch      | String       | Yes      | Channel: `trade` |

Request-Beispiel:
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
| data      | List<Object> | Daten |
| > p       | String       | Ausführungspreis |
| > v       | String       | Ausführungsmenge |
| > s       | String       | Ausführungsseite: `sell`/`buy` |
| > t       | String       | Timestamp |

Push-Daten-Beispiel:
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
