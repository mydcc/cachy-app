# Vendor guidance

Source: https://www.bitget.com/legacy-docs/classic/best-practices
https://www.bitget.com/legacy-docs/classic/faq
https://www.bitget.com/legacy-docs/classic/uta-api-upgrade-guide
https://www.bitget.com/legacy-docs/classic/demotrading/restapi
Crawled on: 2026-09-28

Bitget's own prose about **how to use the API correctly**, as distinct from the
endpoint reference in the other files of this set. Where those files record what
a request or response *is*, the four pages crawled here record what the vendor
*recommends*, what the vendor *guarantees*, and what the vendor *warns about* —
and they are prescriptive in ways the endpoint pages are not. Every quotation
marked "verbatim" is Bitget's own wording. Nothing in this file is an assessment
of whether Bitget's advice is sound, and nothing here describes what any
integration does with the surface.

> Cachy's use of this surface is reconciled in `INTEGRATION_STATUS.md`.

**Five pages were crawled, four were requested.** The Demo Trading REST page
links to a WebSocket sibling (`https://www.bitget.com/legacy-docs/classic/demotrading/websocket`)
and that page carries material the REST page does not — the demo WebSocket hosts
— so it is transcribed here in its own section. All five returned content on
first fetch. **No page returned a 404 and no page redirected.** The
[UTA upgrade guide](#upgrade-to-unified-trading-account) in particular did *not*
redirect, which was worth checking: it is live Classic prose, not a stub.

No live authenticated call was made. Everything below is a claim made by a
document, not an observed behaviour.

---

## Best Practices Guide

> **Could not verify** the following, because the page does not state it: this
> page contains **no rate-limit numbers, no throttling guidance, no retry or
> backoff advice, and no request-frequency discipline whatsoever**. It is the
> page one would expect to carry that material and it does not. The rate-limit
> and retry prose lives in the [FAQ](#faq) instead (Q10, Q11, Q14). A reader
> looking for Bitget's backoff policy will not find one on this page.

What the page does carry is a complete worked narrative of the order lifecycle,
and it is the only page in this set that states the *sequencing* rules.

### `clientOid` is for identification, not idempotency

> To make it easier for the system to identify orders, we recommend users fill in
> the client order ID (`clientOid` field) when placing orders. The client order
> ID must match `^[0-9A-Za-z_:#\\-+\\s]{1,32}$`.

> `clientOid` uniqueness check only applies to all pending orders, but we still
> recommend users always use unique `clientOid` for troubleshooting purposes.

Two things to note about what is *not* said. The page never uses the word
"idempotency", and the uniqueness guarantee is scoped explicitly to **pending**
orders — so on this page's own terms `clientOid` is a correlation handle that is
recyclable once an order leaves the pending book, and the recommendation to
"always use unique `clientOid`" is given for *troubleshooting*, not for
duplicate-order suppression.

> **Conflict.** This 32-character regex contradicts Q13 on the [FAQ](#faq)
> ("length less than 50") and both `clientOid` error codes in
> `08_error_codes.md` — `40304` "length cannot greater than 50" and `40305`
> "length cannot greater than 64, and cannot be Martian characters". Three
> different limits for one field. Not resolved here.

### Subscribe before you place

The single clearest piece of sequencing advice in the whole reference set:

> Before placing orders, users should first subscribe to the order channel using
> WebSocket to monitor order status (such as pending, filled) and take
> appropriate actions (such as placing new orders after complete fill).

> **Note**: The order channel does not push full data on initial subscription,
> only pushes order updates when order status changes (such as from pending to
> canceled).

> In other words, users cannot know the current order data when subscribing to
> the order channel. To get data for unfilled orders before subscribing to the
> order channel, use the following REST API: `GET /api/v2/spot/trade/unfilled-orders`
> (Spot) / `GET /api/v2/mix/order/orders-pending` (Futures)

Subscription shape and acknowledgement:

```json
{"op": "subscribe", "args": [{"instType": "USDT-FUTURES", "channel": "orders", "instId": "default"}]}
{"event": "subscribe", "arg": {"channel": "orders", "instType": "USDT-FUTURES", "instId": "default"}}
```

### A 200 with an `orderId` is not a match

The same caveat is printed three times on the page — after place, after modify,
after cancel — and it is the load-bearing sentence for any client:

> **Note**: This only means the exchange has successfully received the request
> and assigned an order ID to the order. At this point, the order may not have
> reached the matching system yet, and users need to further check the order
> status for confirmation.

> **Note**: A successful response only indicates the exchange has received the
> request. Users should refer to the WebSocket order channel for confirmation.

Verbatim, the page attributes the caveat to the WS `place-order` response and to
cancel alike.

> **Conflict.** The page tells a client to read the cancellation reason from
> `cancelSource`, a field that appears nowhere in the order-detail response table
> in `04_trade.md` — that table names `cancelReason` (values `normal_cancel` /
> `stp_cancel`). The page also documents an order field `fillTime` that
> `04_trade.md` does not list. Not resolved here.

### Expected order-state transitions

| Scenario | Status change |
|---|---|
| Rejected at entry | `code` is not zero, no update push in WebSocket order channel |
| Order placed and immediately fully filled | `live` → `filled` |
| Order placed and immediately filled through multiple trades | `live` → `partially_filled` → … → `filled` |
| Order placed but immediately canceled by matching engine (e.g., IOC, FOK, post-only) | `live` → `canceled` (cancellation reason can be queried from `cancelSource`) |
| IOC order partially filled then canceled by system due to insufficient price depth | `live` → `partially_filled` → `canceled` |

> For Immediate-Or-Cancel (IOC), Fill-Or-Kill (FOK), and post-only orders, these
> orders may be rejected by the matching engine, and users will receive `live`
> followed by `canceled` status.

> The terminal status of an order is `canceled` or `filled`.

> User orders may be canceled by the system for various reasons, such as
> liquidation or self-trade.

> Each fill of an order is assigned a trade ID (`tradeId`) by the system.

Verbatim, on the acceptance signal: *"if the order returns no errors (`"code":
"0"`), users will receive a message in the WebSocket order channel indicating
the order status is `live`."*

> **Note, not resolved here.** The page prints the WebSocket trade response code
> as a **numeric** `0` (`"code":0`) against a REST success of the **string**
> `"00000"`. That is the same `"0"` vs `"00000"` question recorded as unresolved
> in `01_sign.md`; this page is consistent with the `"0"` side but does not
> resolve it.

### WebSocket order placement

> Users can also place orders through WebSocket, which is theoretically more
> efficient and resource-saving than REST.

> Since WebSocket operations are asynchronous communication, users need to
> provide a message ID (`id`) for identification of its return.

```json
{"args":[{"channel":"place-order","id":"NEWtestBTC0123","instId":"BTCUSDT",
  "instType":"USDT-FUTURES","params":{"orderType":"limit","side":"buy","size":"2",
  "tradeSide":"open","price":"501","marginCoin":"USDT","force":"gtc",
  "marginMode":"crossed","clientOid":"testBTC0123"}}],"op":"trade"}
```

The page's own example here pairs `side: "buy"` with `tradeSide: "open"`, i.e.
one-way-shaped placement.

### Modify and cancel

> The modify order interface allows modification of orders in pending status,
> supporting modification of take-profit/stop-loss and their size/price.

REST: `POST /api/v2/spot/trade/cancel-replace-order` (Spot),
`POST /api/v2/mix/order/modify-order` (Futures).

> **Classic account does not support WebSocket order modification**

> **Note**: Orders cannot be modified when completely filled or successfully
> canceled.

Cancel, REST: `POST /api/v2/spot/trade/cancel-order` (Spot),
`POST /api/v2/mix/order/cancel-order` (Futures). Cancel over WebSocket uses
channel `cancel-order` under `op: "trade"` with an `id` and
`params: { orderId, clientOid }`.

> **Note**: Orders cannot be canceled when completely filled or successfully
> canceled.

### Batch operations

> Both placing and canceling orders support batch operations, with a maximum of
> 20 orders per batch.

| Operation | Spot | Futures |
|---|---|---|
| Place Order | `POST /api/v2/spot/trade/batch-orders` | `POST /api/v2/mix/order/batch-place-order` |
| Cancel Order | `POST /api/v2/spot/trade/batch-cancel-order` | `POST /api/v2/mix/order/cancel-batch-orders` |

> Batch operations allow partial order operations to succeed. After receiving
> the response, users should check the `errorCode` and `errorMsg` fields for each
> order in the return result to determine the execution result.

> **Conflict, batch size.** The page says the maximum is **20**; the
> `batch-place-order` and `batch-cancel-orders` parameter tables in `04_trade.md`
> both say **maximum length: 50**, and `08_error_codes.md` carries `40306`
> "Batch processing orders can only process up to 20". Not resolved here.

> **Conflict, path.** The page prints the futures batch-cancel path as
> `/api/v2/mix/order/cancel-batch-orders`; `04_trade.md` prints
> `/api/v2/mix/order/batch-cancel-orders`. The two segments are transposed, and
> only one of the two can be the live path. Not resolved here.

### Order timestamps

| Field | Description (verbatim) |
|---|---|
| `cTime` | Order creation time in the order management system after risk check |
| `uTime` | Last update time of the order in the order management system. Updated after order modification, fill, and cancellation |
| `fillTime` | Order fill time. `fillTime` is the same as the time in public trade data |

That `fillTime` is the same clock as the public trade feed is the only statement
in the whole reference set about cross-referencing a private fill against public
market data.

### Pagination

| Parameter | Required | Description (verbatim) |
|---|---|---|
| `idLessThan` | No | Request paginated content before this ID (older data), the value passed is the corresponding interface's `orderId`, `billId`, `tradeId`, etc. |
| `startTime` | No | Start time, Unix timestamp (milliseconds) |
| `endTime` | No | End time, Unix timestamp (milliseconds) |
| `limit` | No | Number of results returned, maximum 100, default 100 |

The page generalises the cursor value to "`orderId`, `billId`, `tradeId`, etc."
rather than naming `endId` specifically.

Endpoints the page lists as paginated: `GET /api/v2/spot/trade/unfilled-orders`,
`GET /api/v2/spot/trade/history-orders`, `GET /api/v2/spot/trade/fills`,
`GET /api/v2/mix/order/orders-history`, `GET /api/v2/mix/order/fills`.

### Self-trade prevention

> The trading system implements mandatory self-trade prevention at the parent
> account level. All accounts under the same parent account, including the parent
> account itself and all sub-accounts, cannot self-trade. The default STP mode
> for orders is `none`, and users can also specify the order's STP mode through
> the `stpMode` parameter in the order placement interface.

> Bitget supports 4 STP modes (`stpMode`): `none`, `cancel_maker`, `cancel_taker`,
> and `cancel_both`.

> **Note**: The mandatory self-trade prevention feature applies to all users, all
> order types, and all order book trading products.

> The execution result of STP depends on the STP mode of the **Taker** order; the
> STP mode of existing orders in the order book is not considered.

| Mode | Behaviour (verbatim) |
|---|---|
| `none` | Orders are not restricted by the STP mechanism, the system does not compare UIDs, and trading proceeds normally. |
| `cancel_taker` | Cancel the Taker order, keep the Maker order. |
| `cancel_maker` | Cancel the Maker order, keep the Taker order. |
| `cancel_both` | Cancel both Taker and Maker orders. |

> **Note, recorded not resolved.** "Mandatory … the system does not compare
> UIDs" under the default `none` mode is the vendor's own wording; the page does
> not reconcile the two statements.

### Account types and the transfers they force

Four independent account types: Spot, Margin, Futures, Funding — with Funding
being the one that "**Note**: Funds need to be transferred between different
account types through the transfer interface."

> **Conflict, endpoint path.** For futures balance the page prints
> `GET /api/v2/mix/account/accounts` (plural) in two places, and
> `GET /api/v2/mix/account/account` (singular) in a third, for leverage — on the
> same page. `QUICK_REFERENCE.md` lists the singular form for account/balance.
> One page uses both spellings for different calls. Not resolved here.

Position mode may be set via `POST /api/v2/mix/account/set-position-mode`:

> (all positions must be closed and no pending orders before setting)

That precondition is stated in parentheses on the page and is easy to miss.

### Leverage

`GET /api/v2/mix/account/account` reads leverage;
`POST /api/v2/mix/account/set-leverage` writes it.

> Users can use the above API interfaces to preset the leverage for each product
> before trading.

The page's leverage table renders as a header row with no visible cell values;
from the surrounding prose the setting level is **per trading pair**, across all
six combinations of {USDT, USDC, Coin} futures × {cross, isolated}.

```json
{ "symbol": "BTCUSDT", "productType": "usdt-futures", "marginCoin": "usdt", "leverage": "3" }
```

> **Conflict, casing.** This example sends lowercase `"marginCoin": "usdt"` and
> lowercase `"productType"`, while the place-order example on the *same page*
> sends `"marginCoin": "USDT"`. `04_trade.md` states `marginCoin` "must be
> capitalized" and that `productType` is UPPERCASE on the wire.
> `12_doc_defects.md` already records both casing hazards; this is a further
> instance on a page not previously in the set.

### Margin mode is per pair, so it is a required order parameter

> The Classic account system's cross/isolated settings are more flexible,
> allowing users to set cross or isolated margin by trading pair. Therefore,
> users need to specify the margin mode when placing orders.

| Account Type | Product Type | Margin Mode | Order Parameter |
|---|---|---|---|
| Spot Account | Spot | N/A | Not required |
| Margin Account | Margin | Cross | `marginMode=crossed` |
| Margin Account | Margin | Isolated | `marginMode=isolated` |
| Futures Account | Futures | Cross | `marginMode=crossed` |
| Futures Account | Futures | Isolated | `marginMode=isolated` |

### Market data and the order book

Push frequencies, verbatim: `books`, `books5`, `books15` default to `200ms` for
spot and `150ms` for futures; `books1` defaults to `10ms`. Only `books` sends an
incremental format:

> `books` corresponds to full depth data, first push is full data: `snapshot`,
> subsequent pushes are incremental changes: `update`.

> When there are no changes to the order book, the system will not send new
> snapshots.

> Order book data is triggered and pushed by order events. In most cases, users
> receive the same order book data from all WebSocket connections and channels.
> When there are no order book changes for an extended period, the system
> triggers compensatory pushes through scheduled tasks, which may result in
> slightly different push sequence numbers due to clock differences between
> servers.

> The system pushes the latest state of the order book. When depth changes occur
> (including multiple changes in a short time, such as A→B→A), the system sends
> updates for the final state.

Product configuration comes from `GET /api/v2/spot/public/symbols`; changes to it
— "minimum price increment changes and new listings" — from the announcements
interface, printed on the page as `GET /api/v2/public/annoucements`. That
misspelling is in the API path itself; `12_doc_defects.md` already records it.

### Account and position channels

The account channel and the position channel, unlike the order channel, **do**
push full data on initial subscription. Both take an optional `coin` parameter
("currently only supporting all currencies") on the account channel.

> Bitget sends update data to users when valuations change.

> When users specify a currency in the `coin` parameter, the REST API will return
> data for that currency regardless of whether the asset at the currency level is
> 0, unlike the WebSocket account channel. This only applies to currencies that
> have been held before.

`GET /api/v2/mix/account/open-count` gives the maximum openable quantity and
takes `openPrice`, `leverage` and `openAmount` alongside the usual scope:

```http
GET /api/v2/mix/account/open-count?productType=usdt-futures&symbol=ethusdt&marginCoin=USDT&openPrice=23189.5&leverage=20&openAmount=5000
```

REST fallbacks: `GET /api/v2/spot/account/assets` / `GET /api/v2/mix/account/accounts`;
`GET /api/v2/mix/position/all-position` / `GET /api/v2/mix/position/single-position`.

---

## FAQ

Fifteen questions, of which the following are about the API contract. The rest
are about copy trading (Q5, Q7), demo-coin funding (Q4, transcribed under
[Demo Trading](#rest-api-demo-trading)), or support channels (Q1, Q8), and are
noted in one line each at the end.

**Q1 — How to get API support?** *"Join our official API support group and our
admins will answer your questions. https://t.me/bitgetOpenapi"*

**Q2 — Order parameter `symbol`: what should I pass? For example, `BTCUSDT_UMCBL`
or `BTCUSDT`?** *"`BTCUSDT` in 'v2' API, `BTCUSDT_UMCBL` in 'v1' API"*

**Q3 — What does the WebSocket parameter `instId` pass?** *"`BTCUSDT` or
`default`; Please refer to the `symbol` value from Get Contract Config"*

**Q8 — I am using a third party server/codes and it is not working. How can I
get help?** *"Unfortunately, we do not provide troubleshooting support for third
party servers or tools, please contact the third party customer service for
further assistance. In addition, providing your API keys/keys to any other
platform will have portential security risk, and it is up to you to decide
whether to use their services. Please note that we do not provide coding related
help."* (Vendor typo "portential" is in the original.)

**Q9 — If I forget the passphrase of API key, what should I do?** *"The
passphrase of API Key can not be modified, please recreate your API Key."*

### Q10 — What is the rate limit of API?

The rate-limit prose this reference set needed, and it lives here rather than on
the best-practices page:

> 1. The rate limit of each API endpoint is marked on the doc page;
> 2. The rate limit of each API interface is calculated independently;
> 3. The overall rate limit is 6000/IP/Min, After the rate limit is triggered, it
>    takes 5 minutes to recover.

Point 2 is the one with teeth: per-endpoint budgets do not share a pool, so
consuming one endpoint's budget does not reduce another's.

### Q11 — How can I find out the remaining rate limit per second for the API?

> Please refer to the `x-mbx-used-remain-limit` parameter in the response header.

This is the only place in the entire reference set where a rate-limit *read-back*
is documented, and the only occurrence of that header name. **Could not verify**
that the header is actually emitted — no live authenticated call was made.

### Q12 — Is there any currency with a different name in the spot market and the
future market?

> Yes, currently there are three currencies with this situation. 1.Luna2(Future)
> — Luna(Spot) 2.ALT(Future) — $ALT(Spot) 3.MEME(Future) — MEMECOIN(Spot)

A closed list of three as of the crawl date.

### Q13 — Which characters are supported for `clientOid`?

> clientOid supports \[0-9\], \[a-z\],\[A-Z\] and \[-,+,\_,#\], length less
> than 50

> **Conflict.** This contradicts the `^[0-9A-Za-z_:#\-\+\s]{1,32}$` regex on the
> [Best Practices Guide](#best-practices-guide) — 32 characters vs "less than 50",
> and the FAQ omits whitespace from the character class. See that section and
> `08_error_codes.md`. Not resolved here.

### Q14 — Is there a fixed regular release date for backend?

> Yes.The current fixed regular release date for backend is **every Tuesday and
> Thursday from 14:00 PM to 18:00 PM (UTC +8)**(Except for emergency upgrade).
> During the regular release time window, the RestAPI may return 45001, 40725,
> 40808 or 40015 error responses. Users can retry after receiving these error
> responses. WebSocket connections may be disconnected during the release period.
> WebSocket users are advised to implement a reconnection mechanism in your code.

Two things here. *"Users can retry after receiving these error responses"* is the
closest Bitget comes to backoff guidance anywhere in the Classic docs — and it
specifies no delay, no attempt cap, and no jitter. The WebSocket reconnect
sentence is an explicit instruction, not an observation.

> **Conflict, release window.** This is a **third** distinct statement in this
> set. The FAQ says **Tuesday and Thursday** (two days) ending at **18:00** and
> lists **four** codes including `40015`. `12_doc_defects.md` and
> `QUICK_REFERENCE.md` both say **Tuesday–Thursday** (three days) ending at
> **17:00** with three codes, sourced from the 2025-05-19 changelog entry in
> `10_change_log.md`. The FAQ drops Wednesday, extends the window by an hour, and
> adds a code. `12_doc_defects.md` already argues the three codes cannot be
> relied on as release indicators; this adds a fourth candidate. Not resolved
> here.

### Q15 — Is it possible to lose messages when subscribing to private channels
via WebSocket?

> Yes, there is a possibility of message loss. We recommend users always use the
> REST API as a fallback.

The vendor stating outright that private-channel pushes are lossy, and naming
REST as the fallback. This is the single most consequential line on the page for
any client that treats a WebSocket push as the authoritative record of a fill.

**Not about the API contract — noted and moved on:** Q4 (depositing demo coins,
re-claimable every 72 h, transcribed under the demo section below); Q5 (copy-trade
trader minimum open count, from `minOpenCount` on two copy-trading config
endpoints); Q7 (whether you are a "trader", from `traderType` on
`GET /api/v2/spot/account/info`).

---

## Upgrade to Unified Trading Account

> Verbatim, the page's opening line: *"This guide walks you through upgrading
> your integration from the Classic account API (v2) to the Unified Trading
> Account API (v3)."*

> **The most important thing to know about this page, stated up front:** it
> contains **no deprecation date, no sunset notice, no end-of-life statement,
> and no statement about whether the migration is reversible.** The word
> "Classic" is never given an expiry. A reader deciding whether to stay on
> Classic will find a complete field-mapping table here and no schedule
> anywhere. **Could not verify** reversibility — the page is silent, and
> `10_change_log.md` was not crawled for a matching entry.

The only directional pressure on the page is soft:

> - **Higher capital efficiency**: Trade spot and derivatives from a single
>   account, using multiple crypto assets as shared margin. You no longer need to
>   transfer funds between separate spot, margin, and futures accounts, and
>   profits/losses across products can offset each other.
> - **Lower order latency**: UTA's unified account and matching architecture
>   reduces the processing overhead of cross-account and cross-product
>   operations, resulting in faster order placement and execution than the
>   Classic account.
> - **Faster access to new features**: New products and capabilities are
>   prioritized for release on UTA, so upgrading gets you earlier access to the
>   latest features.

The site chrome on all four Classic pages reinforces this without adding a date:
the header reads "Classic" beside "🔥 UTA (Recommended)", and a banner states
*"Bitget's new API documentation is now live."* That is site furniture, not page
prose, and is recorded here only because it is the sole deprecation-adjacent
signal any of these four pages carries.

### Two ways to upgrade

- **Via the web** — links to a support-article walkthrough.
- **Via the API** — call the `Upgrade_Account` endpoint. *"The API supports the
  master account initiating the upgrade itself, as well as upgrading
  sub-accounts."*

### Signature: unchanged

> No changes required

> The signature mechanism is identical between v2 and v3.

Same five headers, and:

> Your existing v2 API Key automatically gains UTA access — there's no need to
> create a new key.

### Endpoint mapping

**Trading.** Every Classic trading endpoint has a v3 counterpart:

| Action | v2 (Classic) | v3 (UTA) |
|---|---|---|
| Place order | `POST /api/v2/mix/order/place-order` (futures), `POST /api/v2/spot/trade/place-order` (spot) | `POST /api/v3/trade/place-order` (all products) |
| Cancel order | `POST /api/v2/mix/order/cancel-order`, `POST /api/v2/spot/trade/cancel-order` | `POST /api/v3/trade/cancel-order` |
| Modify order | `POST /api/v2/mix/order/modify-order`, `POST /api/v2/spot/trade/cancel-replace-order` — **No WebSocket support** | `POST /api/v3/trade/modify-order` — **WebSocket modify supported**, with new `autoCancel` parameter |

**Queries.** Same consolidation:

| Action | v2 (Classic) | v3 (UTA) |
|---|---|---|
| Unfilled orders | `GET /api/v2/spot/trade/unfilled-orders`, `GET /api/v2/mix/order/orders-pending` | `GET /api/v3/trade/unfilled-orders` |
| Historical orders | `GET /api/v2/spot/trade/history-orders`, `GET /api/v2/mix/order/orders-history` | `GET /api/v3/trade/history-orders` |
| Fill details | `GET /api/v2/spot/trade/fills`, `GET /api/v2/mix/order/fills` | `GET /api/v3/trade/fills` |

**Account and market data.** All mapped, with one addition and one structural
substitution:

| Action | v2 (Classic) | v3 (UTA) |
|---|---|---|
| Get account info | `GET /api/v2/spot/account/info` | `GET /api/v3/account/settings` |
| Get balance | `GET /api/v2/spot/account/assets` (spot), `GET /api/v2/mix/account/accounts` (futures) | `GET /api/v3/account/assets` (single endpoint for all products) |
| **Get funding account** | **N/A (separate funding account concept)** | `GET /api/v3/account/funding-assets` |
| Set leverage | `POST /api/v2/mix/account/set-leverage` | `POST /api/v3/account/set-leverage` |
| Set position mode | `POST /api/v2/mix/account/set-position-mode` | `GET /api/v3/account/set-hold-mode` |
| Product configuration | `GET /api/v2/spot/public/symbols`, `GET /api/v2/mix/market/contracts` | `GET /api/v3/public/instruments` (all products) |
| Ticker | `GET /api/v2/spot/market/tickers`, `GET /api/v2/mix/market/ticker` | `GET /api/v3/market/tickers` (all products) |
| Order book | `GET /api/v2/spot/market/orderbook`, `GET /api/v2/mix/market/merge-depth` | `GET /api/v3/market/orderbook` (all products) |
| Candlesticks | `GET /api/v2/spot/market/candles`, `GET /api/v2/mix/market/candles` | `GET /api/v3/market/candles` (all products) |
| Recent trades | `GET /api/v2/spot/market/fills`, `GET /api/v2/mix/market/fills` | `GET /api/v3/market/fills` (all products) |

**Which Classic endpoints have no counterpart — the complete list is short.**
Only two `N/A` cells appear in the whole table, and neither is a removal:

1. **Funding account** — `N/A` on the v2 side because UTA has no separate funding
   account; the concept is replaced rather than carried.
2. **Liquidation public WebSocket channel** — listed in the *v2* column as
   *"Not available in Classic"*, i.e. a **UTA-only capability with no v2
   equivalent at all**.

Conversely, one capability is **added** in v3 and is absent in v2: WebSocket order
modification (plus the new `autoCancel` parameter).

### Field renames

| v2 parameter | v3 parameter | Note (verbatim) |
|---|---|---|
| `productType` (e.g. `usdt-futures`) | `category` (e.g. `USDT-FUTURES`) | Same concept, renamed and uppercased in v3 |
| `marginCoin` | *(removed)* | Not required — UTA determines margin coin automatically from account mode |
| `marginMode` | *(removed from order request)* | Cross/isolated is set at the account/position level, not per order |
| — | `posSide` | New required field in v3 for specifying long/short in hedge mode |
| `size` | `qty` | See Note 2 below |
| `idLessThan` | `cursor` | Same purpose (fetch older data), different parameter name |

Two consequences worth reading carefully:

- The casing of `productType`/`category` **changes** at the migration, in the
  direction of uppercase. `12_doc_defects.md` records `productType` casing as a
  live hazard (uppercase in every parameter table, lowercase in 14 of 20 market
  `curl` examples), so the v2 field a client already gets wrong in places
  becomes consistently uppercase under a different name.
- `posSide` is **not** a new concept. `04_trade.md` already documents `posSide`
  in the v2 **response** of Get Order Detail and Get Pending Orders, as position
  direction with values `long` / `short` / `net`. The same name is promoted to a
  **required request** field in v3 — a request/response role change that a
  client reading only one of the two files would not anticipate.

> **Note, not resolved here.** The mapping table does **not** list a
> `force` → `timeInForce` rename, but the side-by-side `curl` examples differ
> exactly that way (v2 body omits `force`; v3 body carries
> `"timeInForce": "gtc"`). Whether the rename is intended and simply missing from
> the table cannot be determined from this page.

### The page's own three migration warnings, verbatim

> **Note 1 — Forgetting to set `posSide` in Hedge Mode**
>
> If your account is in Hedge Mode, `posSide` (`long` or `short`) is required.
> Omitting it will cause the order to be rejected. In One-way Mode, `posSide` can
> be omitted.

> **Note 2 — Expecting order size to mean the same thing across product types**
>
> In v2, `size` means different things depending on order type and side (base
> coin vs. quote coin for market buy). In v3, the field is renamed to `qty`, but
> the same base-coin/quote-coin distinction for market orders still applies.

> **Note 3 — Assuming error codes are unchanged**
>
> Error code values and meanings are **not guaranteed to be identical** between
> v2 and v3, even for conceptually similar failures. Always check the UTA Error
> Code reference rather than reusing your v2 error-handling logic as-is.

> **Conflict, order size.** `04_trade.md` describes `size` flatly as "Amount
> (base coin)". Note 2 says the base-coin reading does not hold for market buys.
> Not resolved here.

> **Note, not resolved here.** Note 3 bears directly on `08_error_codes.md`, which
> transcribes 829 v2 REST codes. Those are the v2 table; the vendor's own
> warning is that a v2 error-handling mapping cannot be carried across.

### Migration checklist, verbatim

> - Switch the account mode to UTA via Web/API
> - Update your base URL and endpoint paths from `/api/v2/...` to `/api/v3/...`
> - Update order request payloads: remove `marginCoin`/`marginMode`, add
>   `category` and `posSide`, rename `size` to `qty`
> - Update pagination logic: rename `idLessThan` to `cursor`
> - Update WebSocket subscriptions: switch from `channel`+`instType` to
>   `instType: "UTA"` + `topic`
> - Re-test order placement, modification, and cancellation end-to-end in demo
>   trading first
> - Update your error-handling logic against the UTA error code table
> - Verify account/position WebSocket pushes match your expected field names (e.g.
>   `createdTime`/`updatedTime` instead of `cTime`/`uTime`)

The sixth item is the vendor explicitly routing the migration through demo
trading, and the last is the `cTime`/`uTime` rename flagged as a casing-class
hazard in `12_doc_defects.md`.

### WebSocket migration

Public channels move from `channel`+`instType`+`instId` to `topic`+`symbol`:

| Channel | v2 (Classic) | v3 (UTA) |
|---|---|---|
| Ticker | `{"instType": "SPOT", "channel": "ticker", "instId": "BTCUSDT"}` | `{"instType": "spot", "topic": "ticker", "symbol": "BTCUSDT"}` |
| Trades | `{"instType": "SPOT", "channel": "trade", "instId": "BTCUSDT"}` | `{"instType": "spot", "topic": "publicTrade", "symbol": "BTCUSDT"}` |
| Candlesticks | `{"instType": "SPOT", "channel": "candle1m", "instId": "BTCUSDT"}` | `{"instType": "spot", "topic": "kline", "symbol": "BTCUSDT", "interval": "1m"}` |
| Order book | `{"instType": "SPOT", "channel": "books5", "instId": "BTCUSDT"}` | `{"instType": "spot", "topic": "books5", "symbol": "BTCUSDT"}` |
| Liquidation | **Not available in Classic** | `{"instType": "usdt-futures", "topic": "liquidation"}` |

> v2 encodes the candle interval into the channel name (e.g. `candle1m`,
> `candle5m`). v3 keeps `topic: "kline"` fixed and passes the interval as a
> separate `interval` field.

> v2's depth channel supports up to 15 levels (`books15`). v3 renames the deepest
> tier to `books50` (up to 50 levels) and adds a parallel `rpi-books*` channel for
> RPI depth.

> The `liquidation` channel is new in UTA and has no v2 equivalent.

Private channels collapse to a single `instType`:

| Channel | v2 (Classic) | v3 (UTA) |
|---|---|---|
| Order updates | `{"instType": "USDT-FUTURES", "channel": "orders", "instId": "default"}` | `{"instType": "UTA", "topic": "order"}` |
| Account updates | `{"instType": "SPOT", "channel": "account", "coin": "default"}` | `{"instType": "UTA", "topic": "account"}` |
| Position updates | `{"instType": "USDT-FUTURES", "channel": "positions", "instId": "default"}` | `{"instType": "UTA", "topic": "position"}` |

> v2 uses `channel` + `instType` + `instId`/`coin` to scope a subscription per
> product type. v3 simplifies this to a single `instType: "UTA"` + `topic`, since
> one UTA channel now covers all product types at once.

### SDKs and the side-by-side example

Official v3 SDKs are announced for Java, Python, Node.js, Golang and PHP, in the
`BitgetLimited/v3-bitget-api-sdk` repository.

The paired place-order example is the clearest statement of the payload delta:

```json
// v2 (Classic) — USDT-margined futures
{ "symbol": "BTCUSDT", "productType": "usdt-futures", "marginMode": "crossed",
  "marginCoin": "USDT", "clientOid": "testBTC0123", "side": "buy",
  "orderType": "limit", "price": "50000", "size": "0.1" }

// v3 (UTA) — the equivalent order
{ "category": "USDT-FUTURES", "symbol": "BTCUSDT", "clientOid": "testBTC0123",
  "side": "buy", "posSide": "long", "orderType": "limit", "price": "50000",
  "qty": "0.1", "timeInForce": "gtc" }
```

> Notice the request body drops `productType`/`marginMode`/`marginCoin` in favor
> of `category`, and adds `posSide`. The response structure is otherwise the same.

> **Note, not resolved here.** The v3 example sends `"side": "buy"` with
> `"posSide": "long"` — an opening long, not a close. The page states no
> inversion of `side` semantics under v3; `posSide` replaces v2's
> position-direction overload. `QUICK_REFERENCE.md` asserts that "UTA inverts
> this — closing a long is `side: sell` there"; this page neither confirms nor
> contradicts that, because it contains no closing example. Not resolved here.

The v3 response envelope adds `requestTime` relative to the v2 one shown beside
it — both otherwise `{ "code": "00000", "data": { "clientOid", "orderId" } }`.

---

## Rest API Demo Trading

> **Observed 2026-10-04 (account holder): there are no demo API keys — only
> live-account keys exist — and agents never hold keys or send requests.**
> The demo sections below transcribe vendor pages verbatim; they describe the
> vendor's demo program, not a path any agent can or will use. Open behaviour
> questions are settled by trader-side observation, recorded in
> `15_uta_writes.md`.

> **Could not verify** the following, because the page does not state it: **which
> endpoints refuse demo credentials.** Neither demo page contains any list, table
> or note of demo-ineligible endpoints, and neither mentions
> `GET /api/v2/mix/order/fill-history` at all. The demo pages state only the
> header convention below and imply it applies uniformly. (The demo-related
> refusal codes that do exist are catalogued in `08_error_codes.md`, not here;
> the `fill-history` exclusion itself is recorded on the endpoint page in
> `04_trade.md`.) **Could not verify** the demo-ineligible set from these pages.

The page is short — two sections — and says:

> Demo trading allows you to practice trading and test strategies in a
> real-market environment using virtual funds, helping you improve your skills
> and reduce the risk of losses.KYC is needed.

**KYC is required even for demo trading.** (The missing space before "KYC" is in
the original.)

### Demo uses a separate key, not a separate REST host

> To perform demo trading via API, you'll need to create a **Demo API Key** in the
> first place. The steps are as follows: Log in to your account → Switch to Demo
> mode → Go to the Personal Center → Go to the API Key Management → Create a Demo
> API Key → Use the Demo API Key to start trading.

> Please use the created Demo API Key for API calls, and add `paptrading` in the
> request header, with the value set to `1`.

So the REST shape is: **same base URL, separate key type, one extra request
header** `paptrading: 1`. No alternate REST hostname, no alternate path prefix,
and no statement about whether `paptrading` participates in the signature
prehash.

> **Note, named for the record.** `QUICK_REFERENCE.md`'s Base URL table lists
> only `api.bitget.com`, `ws.bitget.com` and `vip-api.bitget.com`, and has no
> demo entry of any kind. The demo WebSocket host below is the one piece of
> vendor infrastructure that table does not carry. Not resolved here.

The funding side of demo trading comes from the [FAQ](#faq) Q4, which is about
demo coins rather than the API: claim them from the official site's Asset
section, and *"You can only claim again 72 hour(s) after your last claim."*

---

## Websocket Demo Trading

> Additional source for this section, crawled because the REST demo page links to
> it and it carries material the REST page does not:
> `https://www.bitget.com/legacy-docs/classic/demotrading/websocket`

The page repeats the demo API Key creation flow verbatim and the same
"KYC is needed" line, then adds the one fact the REST page omits — **demo
WebSocket runs on different hosts**:

> Please use the created Demo API Key for WebSocket connections and request the
> demo trading service address:
> Public: `wss://wspap.bitget.com/v2/ws/public`
> Private: `wss://wspap.bitget.com/v2/ws/private`

The path suffix is unchanged from production (`/v2/ws/public`,
`/v2/ws/private`); only the host differs (`wspap` vs `ws`). So the three
transport separations are: **REST shares the host and separates by header,
WebSocket separates by host.** Neither page states whether the `paptrading: 1`
header is also required for the demo WebSocket — no such header exists in a
WebSocket frame, and the page does not address the question.

---

**For:** Cachy App - Trade Execution Integration
**File:** `docs/bitget-api/13_vendor_guidance.md`
