# Bitget Classic Futures — WebSocket

Source: https://www.bitget.com/legacy-docs/classic/quickStart/websocket-intro
Crawled on: 2026-09-28

The complete WebSocket surface of Classic Futures: two endpoints, 4 public push
channels, 8 private push channels and 2 private **request** channels. Crawled
from `quickStart/websocket-intro` plus all fourteen channel pages under
`contract/websocket/{public,private}/`.

> Cachy wires a subset; see `INTEGRATION_STATUS.md`.

## Two endpoints, not one

There is **no combined socket**. Public and private traffic are on separate URLs
and a private subscription is impossible on the public URL:

| Endpoint | Purpose |
|---|---|
| `wss://ws.bitget.com/v2/ws/public` | Main Domain, Public channel |
| `wss://ws.bitget.com/v2/ws/private` | Main Domain, Private channel |

Both are listed verbatim in the intro page's "Domain" table. There is likewise
**no distinct "private channel URL" form** to remember — the only path string
that looks like one is `/user/verify`, and that is not a URL at all. It is the
constant `requestPath` component of the login signature
(`timestamp + "GET" + "/user/verify"`), the same way REST signs a real path. Do
not attempt to connect to it.

**Login is only required for the private endpoint.** Public channels need no
authentication at all; the `login` frame is rejected or unnecessary there.

## Overview

| # | Channel | Op | Endpoint | Auth | Rate limit (as printed) |
|---|---|---|---|---|---|
| 1 | Market Channel (`ticker`) | `subscribe` | `/v2/ws/public` | none | *not stated in the docs* |
| 2 | Candlestick Channel (`candle*`) | `subscribe` | `/v2/ws/public` | none | *not stated in the docs* |
| 3 | Depth Channel (`books*`) | `subscribe` | `/v2/ws/public` | none | *not stated in the docs* |
| 4 | Public Trade Channel (`trade`) | `subscribe` | `/v2/ws/public` | none | *not stated in the docs* |
| 5 | Equity Channel (`equity`) | `subscribe` | `/v2/ws/private` | `login` (signed) | *not stated in the docs* |
| 6 | Position Channel (`positions`) | `subscribe` | `/v2/ws/private` | `login` (signed) | *not stated in the docs* |
| 7 | History Position Channel (`positions-history`) | `subscribe` | `/v2/ws/private` | `login` (signed) | *not stated in the docs* |
| 8 | Account Channel (`account`) | `subscribe` | `/v2/ws/private` | `login` (signed) | *not stated in the docs* |
| 9 | Order Channel (`orders`) | `subscribe` | `/v2/ws/private` | `login` (signed) | *not stated in the docs* |
| 10 | Trigger Order Channel (`orders-algo`) | `subscribe` | `/v2/ws/private` | `login` (signed) | *not stated in the docs* |
| 11 | Fill Channel (`fill`) | `subscribe` | `/v2/ws/private` | `login` (signed) | *not stated in the docs* |
| 12 | ADL Notification Channel (`adl-noti`) | `subscribe` | `/v2/ws/private` | `login` (signed) | *not stated in the docs* |
| 13 | Place Order Channel (`place-order`) | **`trade`** | `/v2/ws/private` | `login` (signed) | *not stated in the docs* |
| 14 | Cancel Order Channel (`cancel-order`) | **`trade`** | `/v2/ws/private` | `login` (signed) | *not stated in the docs* |

**No channel page prints a rate limit.** Not one of the fourteen. The only
quantitative limits Bitget publishes for WebSocket are the connection,
subscription and message limits on the intro page — reproduced verbatim below.
Those are the de facto rate limits for this surface.

> Channels 13 and 14 are **requests, not pushes**. They are the only two things
> on the WebSocket surface you *send* order instructions on, and they use
> `op:"trade"` rather than `op:"subscribe"`. Every other channel is
> subscribe-and-receive. See [Request channels](#request-channels-op-trade).

## Connection limits

Verbatim from the intro page:

> **Connection limit**: 300 connection requests/IP/5min, Max 100 connections/IP
>
> **Subscription limit**: 240 subscription requests/Hour/connection, Max 1000
> channel subscription/connection

> 1. Users set a 30 seconds timer to a send string "ping", and expect a string
>    "pong" as response. If no string "pong" received, please reconnect
> 2. Websocket server will disconnect the connection if there is no string
>    "ping" received for 2 min
> 3. The Websocket server accepts up to 10 messages per second. The message
>    includes:
>    - String "ping"
>    - JSON message, including login, subscribe, unsubscribe.
> 4. If the user sends more messages than the limit, the connection will be
>    disconnected. The IP which is repeatedly disconnected may be blocked by
>    the server
> 5. We highly recommend you to subscribe **less than 50 channels in one
>    connection**. The connections with less channel subscriptions will be more
>    stable.

| Limit | Value | Scope |
|---|---|---|
| Connection requests | `300 connection requests/IP/5min` | per IP |
| Concurrent connections | `Max 100 connections/IP` | per IP |
| Subscription requests | `240 subscription requests/Hour/connection` | per connection |
| Concurrent channel subscriptions | `Max 1000 channel subscription/connection` | per connection |
| Outgoing messages | `up to 10 messages per second` | per connection |
| Multi-channel subscribe size | "the total length of multiple channels cannot exceed 4096 bytes at a time" | per message |
| Recommended | "subscribe **less than 50 channels in one connection**" | per connection |

Consequences worth stating plainly:

- The 10-messages-per-second budget is a **hard ceiling, and violating it drops
  the connection** — not a soft throttle. "The IP which is repeatedly
  disconnected may be blocked by the server", so it is also a
  ban-risk, not just a reconnect.
- `ping` counts against that same 10/s budget. It is listed as one of the two
  message kinds the limit covers.
- The 4096-byte cap is per **multi-channel subscribe message**, not per channel.
  The intro page states it in the Subscribe section: "Users can choose to
  subscribe to one or more channels, and the total length of multiple channels
  cannot exceed 4096 bytes at a time."
- The 1000-subscription ceiling and the 50-channel recommendation are
  inconsistent with each other by a factor of 20, and both are printed. The
  hard limit is 1000; the guidance is 50.

## ⚠️ Bitget states outright that pushes can be lost

From the FAQ (Q15, `13_vendor_guidance.md`), verbatim:

> Yes.The current fixed regular release date for backend is every Tuesday and
> Thursday from 14:00 PM to 18:00 PM (UTC +8)… Yes, there is a possibility of
> message loss. We recommend users always use the REST API as a fallback.

Taken apart, that answer contains two claims:

1. **There is no delivery guarantee on the private channels.** Bitget's own
   guidance is to treat the WebSocket as an optimisation and keep REST as the
   source of truth. It is not a latency layer in front of a durable feed.
2. The 24-hour forced disconnect is a *scheduled* one, alongside the weekly
   release window.

This is the vendor confirming the failure mode that a `pseq`/`seq` gap check
exists to detect. A client that treats a private push as authoritative state
will drift silently during a disconnect or a lost message. A client that
re-reads REST on reconnect will not.

## Heartbeat

- **Client → server:** the literal string `ping` (not a JSON object), on a
  ~30-second timer. Verbatim: "Users set a 30 seconds timer to a send string
  "ping", and expect a string "pong" as response."
- **Server → client:** the literal string `pong`. Verbatim: "If no string "pong"
  received, please reconnect".
- **Server-side timeout:** "Websocket server will disconnect the connection if
  there is no string "ping" received for 2 min" — two minutes, not 30 seconds.
  The client timer and the server timeout are deliberately different.

## Login

### Request

```json
{ "op":"login",
  "args":[
    { "apiKey":"<api_key>",
      "passphrase":"<passphrase>",
      "timestamp":"<timestamp>",
      "sign":"<sign>" } ] }
```

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `op` | String | Yes | `login` |
| `args` | List\<Object\> | Yes | — |
| `>apiKey` | String | Yes | Unique identification for invoking API. Requires user to apply one manually |
| `>passphrase` | String | Yes | APIKey password |
| `>timestamp` | String | Yes | Unix timestamp, "which will expire in 30 seconds". **Unit disputed — see below** |
| `>sign` | String | Yes | Signature string, see the algorithm below |

### Sign algorithm

Verbatim from the page: "First concatenate `timestamp`, `method`, `requestPath`,
then use HMAC SHA256 method to encrypt the concatenated string with SecretKey,
and then perform Base64 encoding."

- `method`: always `'GET'`.
- `requestPath`: always `'/user/verify'`.
- `secretKey`: "The security key generated when the user applies for APIKey,
  e.g. : 22582BD0CFF14C41EDBF1AB98506286D".

So: `sign = Base64(HMAC-SHA256(timestamp + "GET" + "/user/verify", secretKey))`
— structurally the same as the REST signature in `01_sign.md`, with a fixed
method and path instead of the real ones.

The page documents both **HMAC** and **RSA** variants:

- *HMAC:* concat, then `hmac_sha256(content, secretkey)`, then `base64.encode(hash)`.
- *RSA:* "Use the RSA privateKey **privateKey** to encrypt the string to be
  signed with SHA-256", then "Base64 encoding for Signature."

Expiry: "The request will expire 30 seconds after the timestamp. If your server
time differs from the API server time, we recommended using the REST API to
query the API server time and then compare the timestamp." And: "If login fails,
it will automatically disconnect".

### Success / failure

```json
{ "event":"login", "code":"0", "msg":"" }
```

```json
{ "event":"error", "code":"30005", "msg":"error" }
```

> ### ⚠️ Unresolved: the login timestamp unit
>
> The docs contradict themselves, and this file does **not** pick a winner.
> Four sources, two different units:
>
> | Source on the page | Verbatim | Implied unit |
> |---|---|---|
> | Prose | "**timestamp**: Unix timestamp **in milliseconds**, which will expire in 30 seconds." | milliseconds |
> | JavaScript snippet | `const timestamp ='' + Date.now()` | milliseconds |
> | Java sample | `Long timestamp = System.currentTimeMillis() / 1000;` | **seconds** |
> | Wire example | `"timestamp":"1538054050"` | **seconds** (read as ms it is 1970-01-18) |
>
> The Java snippet is itself internally inconsistent: it divides by 1000, which
> converts a millisecond clock to seconds, and then uses the result
> unconditionally. The wire example `"1538054050"` is a 10-digit value — a
> second-resolution Unix timestamp for late 2018, and meaningless as
> milliseconds.
>
> The prose and the JavaScript sample say milliseconds. The Java sample and the
> concrete example on the wire say seconds. **Both are recorded here as found;
> the contradiction is left open.** A client that must interoperate should
> determine the unit empirically against the live endpoint rather than trusting
> either half of this page.
>
> Also note the same page contradicts itself on the field name: the prose calls
> it `timestamp` in seconds in one place and the Java snippet types it `Long`
> while concatenating it into a `String content`. Neither matches a millisecond
> `Date.now()` without conversion.

> ### ⚠️ Unresolved: the login success code
>
> Login success is documented as `{"event":"login","code":"0","msg":""}` — the
> **string `"0"`**. Every REST endpoint in this API family signals success as
> `code: "00000"` (see `04_trade.md` and `00_common.md`). `"0"` is a different
> value with a different digit count.
>
> This is recorded as printed and not reconciled. Note that the two private
> request channels use a **third** form: their response example carries the
> **number** `0`, not a string — `"code":0`. So across this one surface there are
> three success-code renderings: `"0"` (login), `0` (trade request channels),
> `"00000"` (REST).

## Subscribe and unsubscribe

### Subscribe

```json
{ "op":"subscribe", "args":[ { "instType":"USDT-FUTURES", "channel":"ticker", "instId":"BTCUSDT" } ] }
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `op` | String | Yes | Operation, `subscribe` |
| `args` | Array | Yes | List of subscribe channels |
| `> instType` | String | No | Instrument Type |
| `> channel` | String | Yes | Channel name |
| `> instId` | String | No | Instrument ID |

Acknowledgement:

```json
{ "event": "subscribe", "arg": { "instType":"SPOT", "channel":"ticker", "instId":"BTCUSDT" } }
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `event` | String | Yes | Event, subscribe error |
| `arg` | Object | No | Subscribed channel |
| `> instType` | String | No | Instrument Type MC：Perpetual contract public channel |
| `> channel` | String | Yes | Channel name |
| `> instId` | String | No | Instrument ID |
| `code` | String | No | Error code |
| `msg` | String | No | Error message |

> **Doc defect:** the subscribe example uses `"instType":"SPOT"` on a page that
> is entirely about Futures, and the same `"SPOT"` appears in the
> acknowledgement example. The per-channel pages all use `USDT-FUTURES`.
>
> **Doc defect:** the `> instType` return description reads "Instrument Type
> **MC**：Perpetual contract public channel" — "MC" is a leftover from the Spot
> documentation and the sentence is ungrammatical.
>
> **Doc defect:** the `event` return description reads "Event, subscribe
> **error**" on both the subscribe ack and the unsubscribe ack, implying the
> successful acknowledgement is an error event. The payload contradicts it.

### Unsubscribe

```json
{ "op":"unsubscribe", "args":[ { "instType":"USDT-FUTURES", "channel":"ticker", "instId":"BTCUSDT" } ] }
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `op` | String | Yes | Operation, unsubscribe |
| `args` | Array | Yes | List of channels to unsubscribe from |
| `> instType` | String | Yes | Instrument Type MC：Perpetual contract public channel |
| `> channel` | String | Yes | Channel name |
| `> instId` | String | Yes | Instrument ID |

| Return field | Type | Required | Description |
|---|---|---|---|
| `event` | String | Yes | Event, unsubscribe error |
| `arg` | Object | Yes | Unsubscribed channel |
| `> instType` | String | Yes | Instrument Type |
| `> channel` | String | Yes | Channel name |
| `> instId` | String | Yes | Instrument ID |
| `code` | String | No | Error Code |
| `msg` | String | No | Error Message |

> **Doc defect:** the unsubscribe "Example Response" is the **request** shape —
> it has `"op":"unsubscribe"` and no `event` field at all, where every other
> example on the page returns `event`. The label is wrong.
>
> **Note:** unlike `subscribe`, the unsubscribe table marks `instType` and
> `instId` **Required: Yes** while the subscribe table marks them
> **Required: No**.

### `instType` and `instId`

- `instType` values across every channel page: `USDT-FUTURES`, `COIN-FUTURES`,
  `USDC-FUTURES`. Uppercase, matching the REST `productType` vocabulary.
- `instId` is "either `symbol` or `default`" — the intro page states this
  directly, and the private channel pages spell out what `default` means per
  channel: "All trading pairs" for `orders`, "represents all the symbols，Only
  default is supported now" for `positions` and `positions-history` (note the
  **full-width comma** in the source), "By default, subscribes to all symbols"
  for `adl-noti`, "Product ID or default" for `fill`.
- One private channel breaks the pattern: **`account` uses `coin`, not
  `instId`**, as its selector key — "Coin name，`default` represents all the
  coins，Only default is supported now" (again a full-width comma). And
  `equity` sends no selector at all, just `instType` and `channel`.

## Public channels

### `ticker` — Market Channel

- Rate limit: *not stated in the docs*
- Auth: none (public endpoint)
- Page: `contract/websocket/public/Tickers-Channel`

Subscribe with
`{"instType":"USDT-FUTURES","channel":"ticker","instId":"BTCUSDT"}`. Push
latency, verbatim: "When there is a change (deal, buy, sell, issue): 300ms to
400ms." Every push carries `action: "snapshot"` and an outer `ts`.

This is the only public channel carrying `markPrice` **and** `indexPrice`, which
is what makes it the funding and liquidation reference — the REST ticker
surfaces neither consistently.

| Push field | Meaning |
|---|---|
| `instId` | Product ID |
| `symbol` | Trading pair |
| `lastPr` | Last traded price |
| `bidPr` / `bidSz` | Best bid price / size |
| `askPr` / `askSz` | Best ask price / size |
| `open24h` | 24 h open |
| `high24h` / `low24h` | 24 h high / low |
| `baseVolume` / `quoteVolume` | 24 h volume, base / quote |
| `change24h` | 24 h change |
| `fundingRate` | Current funding rate |
| `nextFundingTime` | Next funding timestamp |
| `markPrice` | Mark price |
| `indexPrice` | Index price |
| `holdingAmount` | Open interest |
| `deliveryPrice` | Delivery price |
| `openUtc` | Open time (UTC) |
| `symbolType` | `1`→perpetual, `2`→delivery |
| `ts` | Timestamp |

### `candle*` — Candlestick Channel

- Rate limit: *not stated in the docs*
- Auth: none (public endpoint)
- Page: `contract/websocket/public/Candlesticks-Channel`

Push behaviour, verbatim: "The channel will push a snapshot after successful
subscribed, later on the updates will be pushed"; "When there are transactions
in the K-line channel, data is pushed once per second. When there are no
transactions, data is pushed once at the specified time granularity."

Note the irregular cadence: a 1-minute candle that has trades pushes **every
second**, not once a minute. History is not on this channel — "If intended to
query history data in a customized time range, please refer to Get Candle Data".

**19 granularities**, exactly as listed:

| Group | Channels |
|---|---|
| Local time | `candle1m`, `candle5m`, `candle15m`, `candle30m`, `candle1H`, `candle4H`, `candle12H`, `candle1D`, `candle1W`, `candle6H`, `candle3D`, `candle1M` |
| UTC | `candle6Hutc`, `candle12Hutc`, `candle1Dutc`, `candle3Dutc`, `candle1Wutc`, `candle1Mutc` |

> **Note:** UTC variants exist only for 6H, 12H, 1D, 3D, 1W and 1M. There is no
> `candle1mutc`, `candle5mutc`, `candle15mutc`, `candle30mutc` or
> `candle4Hutc`. The intraday-UTC gap is real, not an omission in this table.
>
> **Doc defect:** the enumeration lists `candle1D` and `candle1W` *before*
> `candle6H`, `candle3D` and `candle1M`, i.e. not in ascending duration. The
> ordering is not meaningful — do not read it as a sequence.

`data` is a `List<String>` of positional 8-element arrays:

| Index | Meaning |
|---|---|
| `[0]` | Start time, milliseconds format of Unix timestamp, e.g. `1597026383085` |
| `[1]` | Opening price |
| `[2]` | Highest price |
| `[3]` | Lowest price |
| `[4]` | Closing price |
| `[5]` | "The value is the trading volume of left coin" |
| `[6]` | Trading volume of quote currency |
| `[7]` | Trading volume of USDT |

> **Doc defect:** `[5]` ("volume of left coin"), `[6]` ("quote currency") and
> `[7]` ("USDT") are three separately documented volume fields with
> overlapping and partly circular descriptions. For a USDT-M pair `[6]` and
> `[7]` describe the same number. Which one corresponds to the REST
> `baseVolume` / `quoteVolume` pair is not stated. Not resolvable from the page.

### `books`, `books1`, `books5`, `books15` — Depth Channel

- Rate limit: *not stated in the docs*
- Auth: none (public endpoint)
- Page: `contract/websocket/public/Order-Book-Channel`

Push frequencies, verbatim:

> Default data push frequency for `books`, `books5`, `books15` is **150ms**
> Default data push frequency for `books1`:**10ms**

| Channel | Depth | Cadence | Shape |
|---|---|---|---|
| `books` | all levels | 150 ms | `snapshot` first, then incremental `update` |
| `books1` | 1st level | 10 ms | `snapshot` each time |
| `books5` | 5 levels | 150 ms | `snapshot` each time |
| `books15` | 15 levels | 150 ms | `snapshot` each time |

Verbatim: "`books`: All levels of depth. First update pushed is full data:
`snapshot`, and then push the update data: `update`".

> **⚠️ Doc inconsistency: `books1` vs `book1`.** The **channel table** on this
> page says "Channel name: `books/books1/books5/books15`" and the request
> example sends `"channel": "books5"`. But the prose sentence immediately above
> the list says: "Use `books` for snapshot data, **`book1` for 1 depth level,
> `book5` for 5 depth levels, `book15` for 15 depth levels**" — all **singular**.
> Both spellings are printed on the same page. The plural form is the one used
> in the frequency sentence, the channel table, the request example and the
> example response, and is therefore the wire form; the singular sentence is
> the outlier. Not resolvable from the page, and a plausible source of a silent
> non-subscription.

**Gap detection.** Verbatim: "The seq of update incremental messages is
incrementing except during symbol maintenance."

| Field | Declared type | Meaning |
|---|---|---|
| `seq` | Long | "Serial number. It increases when the order book is updated and can be used to determine whether there is out-of-order packets." |
| `pseq` | String | "The serial number of the previous push. For the `books` channel: non-zero when pushing incremental update data. For `books1`, `books5`, and `books15` channels: always `0`. Can be used to determine whether there is packet loss." |
| `ts` (in `data`) | String | Match engine timestamp(ms), e.g. `1597026383085` |
| `ts` (outer) | String | Data streaming time |

> **Doc defect:** `pseq` is declared `String` but the example shows an unquoted
> number (`"pseq": 122`), and `seq` is declared `Long` and shown unquoted. The
> two are the same kind of sequence number, so the type declarations disagree
> with each other and with the payload.
>
> **Doc defect:** there are **two different `ts` fields** — a per-row
> "Match engine timestamp" and an outer "Data streaming time" — both declared
> `String`, both unquoted numbers in the example. They are not interchangeable
> and the page does not say which is authoritative for ordering.
>
> **Note:** `pseq` being always `0` on the snapshot channels is consistent with
> them carrying no incremental stream, so gap detection only applies to
> `books`.

`asks` / `bids` are `List<String>` of `[price, size]` pairs.

### `trade` — Public Trade Channel

- Rate limit: *not stated in the docs*
- Auth: none (public endpoint)
- Page: `contract/websocket/public/New-Trades-Channel`

"Get the public trade data(taker orders)" — taker prints only, no maker prints.
Marked "Real-time Push" with no stated cadence.

| Push field | Meaning |
|---|---|
| `ts` | Fill time: `1597026383085` |
| `price` | Filled price |
| `size` | Filled amount |
| `side` | Filled side, `sell`/`buy` |
| `tradeId` | tradeId |

The eight private push channels, the two `op:"trade"` request channels, the
WS-vs-REST vocabulary mismatch table and this group's doc defects are in
`07_websocket_private.md`.

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/07_websocket.md`
